-- Cards system overhaul: shop-first acquisition, backend effects, hint history, and admin-configured params.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS shop_price INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shop_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shop_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS effect_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effect_duration_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hint_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS linked_mission_id UUID REFERENCES public.missions(id);

DROP TRIGGER IF EXISTS update_cards_updated_at ON public.cards;
CREATE TRIGGER update_cards_updated_at
BEFORE UPDATE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.card_hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level > 0),
  hint_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_id, mission_id, level, hint_text)
);
ALTER TABLE public.card_hints ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_hint_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  hint_id UUID NOT NULL REFERENCES public.card_hints(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  revealed_hint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, hint_id)
);
ALTER TABLE public.team_hint_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_card_defenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  activation_id UUID REFERENCES public.card_activations(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_card_defenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.card_purchase_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  purchased_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.card_purchase_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.card_activations
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'activate',
  ADD COLUMN IF NOT EXISTS effect_result JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_activations_action_type_check'
  ) THEN
    ALTER TABLE public.card_activations
      ADD CONSTRAINT card_activations_action_type_check
      CHECK (action_type IN ('activate', 'healing', 'attack', 'defend', 'hint'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_hints' AND policyname = 'Authenticated can read card hints'
  ) THEN
    CREATE POLICY "Authenticated can read card hints" ON public.card_hints
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_hints' AND policyname = 'Admins can manage card hints'
  ) THEN
    CREATE POLICY "Admins can manage card hints" ON public.card_hints
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_hint_history' AND policyname = 'Teams can view own hint history'
  ) THEN
    CREATE POLICY "Teams can view own hint history" ON public.team_hint_history
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_card_defenses' AND policyname = 'Admins can manage defense states'
  ) THEN
    CREATE POLICY "Admins can manage defense states" ON public.team_card_defenses
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_purchase_logs' AND policyname = 'Teams can view own purchase logs'
  ) THEN
    CREATE POLICY "Teams can view own purchase logs" ON public.card_purchase_logs
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.purchase_shop_card(
  p_team_id UUID,
  p_card_id UUID,
  p_quantity INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_card public.cards;
  v_total_price INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'You are not allowed to purchase for this team';
  END IF;

  SELECT * INTO v_card
  FROM public.cards
  WHERE id = p_card_id
  FOR UPDATE;

  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'Card not found';
  END IF;

  IF NOT v_card.shop_visible OR NOT v_card.shop_enabled THEN
    RAISE EXCEPTION 'Card is not available in the shop';
  END IF;

  v_total_price := COALESCE(v_card.shop_price, 0) * p_quantity;

  IF v_total_price < 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  IF COALESCE(v_team.points, 0) < v_total_price THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE public.teams
  SET points = points - v_total_price,
      updated_at = now()
  WHERE id = v_team.id;

  PERFORM public.apply_card_delta(v_team.id, v_card.id, p_quantity);

  INSERT INTO public.card_purchase_logs (
    team_id,
    card_id,
    quantity,
    unit_price,
    total_price,
    purchased_by_user_id
  ) VALUES (
    v_team.id,
    v_card.id,
    p_quantity,
    COALESCE(v_card.shop_price, 0),
    v_total_price,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', v_card.id,
    'quantity', p_quantity,
    'total_price', v_total_price,
    'remaining_points', (SELECT points FROM public.teams WHERE id = v_team.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_team_card(
  p_team_id UUID,
  p_card_id UUID,
  p_target_team_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_card public.cards;
  v_target public.teams;
  v_hint public.card_hints%ROWTYPE;
  v_defense_count INTEGER;
  v_before_health NUMERIC;
  v_after_health NUMERIC;
  v_effect_result JSONB := '{}'::jsonb;
  v_mission_id UUID;
  v_action_type TEXT;
  v_target_blocked BOOLEAN := false;
  v_activation_id UUID;
BEGIN
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'You are not allowed to use cards for this team';
  END IF;

  SELECT * INTO v_card
  FROM public.cards
  WHERE id = p_card_id
  FOR UPDATE;

  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'Card not found';
  END IF;

  IF NOT v_card.shop_enabled THEN
    RAISE EXCEPTION 'Card is disabled';
  END IF;

  PERFORM public.apply_card_delta(v_team.id, v_card.id, -1);

  IF v_card.card_type IN ('recovery', 'enhancement') THEN
    v_action_type := 'healing';
    v_before_health := COALESCE(v_team.health_status, 100);
    v_after_health := LEAST(100, v_before_health + COALESCE(v_card.effect_percent, 0));

    UPDATE public.teams
    SET health_status = v_after_health,
        updated_at = now()
    WHERE id = v_team.id;

    v_effect_result := jsonb_build_object(
      'effect', 'healing',
      'health_before', v_before_health,
      'health_after', v_after_health,
      'amount', COALESCE(v_card.effect_percent, 0)
    );
  ELSIF v_card.card_type IN ('manipulation', 'penalizing') THEN
    v_action_type := 'attack';

    IF p_target_team_id IS NULL OR p_target_team_id = v_team.id THEN
      RAISE EXCEPTION 'Target team is required for attack cards';
    END IF;

    SELECT * INTO v_target
    FROM public.teams
    WHERE id = p_target_team_id
    FOR UPDATE;

    IF v_target.id IS NULL THEN
      RAISE EXCEPTION 'Target team not found';
    END IF;

    SELECT COUNT(*) INTO v_defense_count
    FROM public.team_card_defenses d
    WHERE d.team_id = v_target.id
      AND d.expires_at > now();

    IF v_defense_count > 0 THEN
      v_target_blocked := true;
      v_effect_result := jsonb_build_object(
        'effect', 'attack',
        'blocked', true,
        'target_team_id', v_target.id,
        'damage', 0
      );
    ELSE
      v_before_health := COALESCE(v_target.health_status, 100);
      v_after_health := GREATEST(0, v_before_health - COALESCE(v_card.effect_percent, 0));

      UPDATE public.teams
      SET health_status = v_after_health,
          updated_at = now()
      WHERE id = v_target.id;

      IF v_after_health <= 0 THEN
        PERFORM public.apply_health_penalty_and_suspend(v_target.id);
      END IF;

      v_effect_result := jsonb_build_object(
        'effect', 'attack',
        'blocked', false,
        'target_team_id', v_target.id,
        'health_before', v_before_health,
        'health_after', v_after_health,
        'damage', COALESCE(v_card.effect_percent, 0)
      );
    END IF;
  ELSIF v_card.card_type = 'protection' THEN
    v_action_type := 'defend';
    INSERT INTO public.team_card_defenses (team_id, card_id, activation_id, expires_at)
    VALUES (
      v_team.id,
      v_card.id,
      NULL,
      now() + make_interval(mins => GREATEST(COALESCE(v_card.effect_duration_minutes, 0), 1))
    );

    v_effect_result := jsonb_build_object(
      'effect', 'defend',
      'duration_minutes', GREATEST(COALESCE(v_card.effect_duration_minutes, 0), 1)
    );
  ELSIF v_card.card_type IN ('hint_single', 'hint_combined') THEN
    v_action_type := 'hint';
    v_mission_id := v_card.linked_mission_id;

    IF v_mission_id IS NULL THEN
      SELECT id INTO v_mission_id
      FROM public.missions
      WHERE is_open = true
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_mission_id IS NULL THEN
      RAISE EXCEPTION 'No active mission available for hints';
    END IF;

    SELECT * INTO v_hint
    FROM public.card_hints h
    WHERE h.card_id = v_card.id
      AND h.mission_id = v_mission_id
      AND h.level = COALESCE(v_card.hint_level, 1)
      AND h.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_hint_history hh
        WHERE hh.team_id = v_team.id
          AND hh.hint_id = h.id
      )
    ORDER BY random()
    LIMIT 1;

    IF v_hint.id IS NULL THEN
      RAISE EXCEPTION 'No unused hint available for this team';
    END IF;

    INSERT INTO public.team_hint_history (
      team_id,
      hint_id,
      card_id,
      mission_id,
      level,
      revealed_hint
    ) VALUES (
      v_team.id,
      v_hint.id,
      v_card.id,
      v_mission_id,
      v_hint.level,
      v_hint.hint_text
    );

    v_effect_result := jsonb_build_object(
      'effect', 'hint',
      'mission_id', v_mission_id,
      'level', v_hint.level,
      'hint_text', v_hint.hint_text,
      'hint_id', v_hint.id
    );

    INSERT INTO public.notifications (user_id, team_id, type, title, message)
    VALUES (
      auth.uid(),
      v_team.id,
      'announcement',
      'Hint Unlocked',
      v_hint.hint_text
    );
  ELSE
    v_action_type := 'activate';
    v_effect_result := jsonb_build_object('effect', 'generic', 'message', 'Card activated');
  END IF;

  INSERT INTO public.card_activations (
    team_id,
    card_id,
    target_team_id,
    card_name,
    card_rarity,
    action_type,
    effect_result
  ) VALUES (
    v_team.id,
    v_card.id,
    p_target_team_id,
    v_card.name,
    v_card.rarity,
    v_action_type,
    v_effect_result
  )
  RETURNING id INTO v_activation_id;

  IF v_action_type = 'defend' THEN
    UPDATE public.team_card_defenses
    SET activation_id = v_activation_id
    WHERE team_id = v_team.id
      AND card_id = v_card.id
      AND activation_id IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'action_type', v_action_type,
    'result', v_effect_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_card_activation(
  p_team_id UUID,
  p_card_id UUID,
  p_target_team_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.activate_team_card(p_team_id, p_card_id, p_target_team_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_card_shop_config(
  p_card_id UUID,
  p_shop_price INTEGER,
  p_shop_visible BOOLEAN,
  p_shop_enabled BOOLEAN,
  p_effect_percent NUMERIC,
  p_effect_duration_minutes INTEGER,
  p_hint_level INTEGER,
  p_linked_mission_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can manage card shop configuration';
  END IF;

  UPDATE public.cards
  SET shop_price = COALESCE(p_shop_price, shop_price),
      shop_visible = COALESCE(p_shop_visible, shop_visible),
      shop_enabled = COALESCE(p_shop_enabled, shop_enabled),
      effect_percent = COALESCE(p_effect_percent, effect_percent),
      effect_duration_minutes = COALESCE(p_effect_duration_minutes, effect_duration_minutes),
      hint_level = COALESCE(p_hint_level, hint_level),
      linked_mission_id = p_linked_mission_id
  WHERE id = p_card_id;
END;
$$;

-- Shop-first card acquisition: convert legacy mission completion reward card inserts to no-op card drops.
CREATE OR REPLACE FUNCTION public.validate_quest_completion_atomic(p_quest_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qt public.quest_teams%ROWTYPE;
  v_quest public.side_quests%ROWTYPE;
  v_coffre_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can validate quest completion';
  END IF;

  SELECT * INTO v_qt
  FROM public.quest_teams
  WHERE id = p_quest_team_id
  FOR UPDATE;

  IF v_qt.id IS NULL THEN
    RAISE EXCEPTION 'Quest team row not found';
  END IF;

  IF v_qt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Quest is not in progress';
  END IF;

  SELECT * INTO v_quest
  FROM public.side_quests
  WHERE id = v_qt.quest_id
  FOR UPDATE;

  IF v_quest.slots_filled >= v_quest.max_slots THEN
    RAISE EXCEPTION 'Quest reward slots are full';
  END IF;

  UPDATE public.side_quests
  SET slots_filled = slots_filled + 1
  WHERE id = v_quest.id;

  INSERT INTO public.coffres (team_id, tier_id, coffre_type, source_label)
  VALUES (v_qt.team_id, NULL, 'quest_reward', v_quest.title)
  RETURNING id INTO v_coffre_id;

  -- Cards are shop-only. Quest completions no longer grant card inventory.
  UPDATE public.quest_teams
  SET status = 'reward_claimed',
      completed_at = now(),
      updated_at = now()
  WHERE id = v_qt.id;

  INSERT INTO public.notifications (user_id, team_id, type, title, message)
  SELECT t.user_id, t.id, 'announcement', 'Quest Completed',
         'Quest completion confirmed. Rewards are available in the shop system.'
  FROM public.teams t
  WHERE t.id = v_qt.team_id;

  RETURN jsonb_build_object('ok', true, 'coffre_id', v_coffre_id, 'cards_granted', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_coffre_atomic(p_coffre_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_coffre public.coffres%ROWTYPE;
  v_cards JSONB;
BEGIN
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid();

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Team profile not found';
  END IF;

  SELECT * INTO v_coffre
  FROM public.coffres
  WHERE id = p_coffre_id
    AND team_id = v_team_id
  FOR UPDATE;

  IF v_coffre.id IS NULL THEN
    RAISE EXCEPTION 'Coffre not found';
  END IF;

  IF v_coffre.is_opened THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'description', c.description,
          'card_type', c.card_type,
          'rarity', c.rarity,
          'image_url', c.image_url
        )
        ORDER BY c.sort_order, c.name
      ),
      '[]'::jsonb
    )
    INTO v_cards
    FROM public.coffre_cards cc
    JOIN public.cards c ON c.id = cc.card_id
    WHERE cc.coffre_id = v_coffre.id;

    RETURN jsonb_build_object('ok', true, 'already_opened', true, 'cards', v_cards);
  END IF;

  UPDATE public.coffres
  SET is_opened = true,
      opened_at = now()
  WHERE id = v_coffre.id;

  -- Coffres now only reveal their contents; they do not grant cards to inventory.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'card_type', c.card_type,
        'rarity', c.rarity,
        'image_url', c.image_url
      )
      ORDER BY c.sort_order, c.name
    ),
    '[]'::jsonb
  )
  INTO v_cards
  FROM public.coffre_cards cc
  JOIN public.cards c ON c.id = cc.card_id
  WHERE cc.coffre_id = v_coffre.id;

  RETURN jsonb_build_object('ok', true, 'already_opened', false, 'cards', v_cards);
END;
$$;
