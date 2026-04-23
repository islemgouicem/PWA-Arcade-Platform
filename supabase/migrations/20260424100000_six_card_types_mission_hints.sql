-- Six strict card types + mission-scoped hint pool + per-team hint history.
-- Replaces legacy card_type enum (hint_single, recovery, manipulation, protection).

-- ---------------------------------------------------------------------------
-- 1) Mission hint content (per mission, tier low/mid/high)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mission_hint_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('low', 'mid', 'high')),
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_hint_entries_mission_tier_idx
  ON public.mission_hint_entries (mission_id, tier)
  WHERE is_active = true;

ALTER TABLE public.mission_hint_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage mission_hint_entries" ON public.mission_hint_entries;
CREATE POLICY "Admins manage mission_hint_entries"
  ON public.mission_hint_entries
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 2) Unlocked hints per team (duplicate prevention: unique team + entry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_mission_hint_reveals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  mission_hint_entry_id UUID NOT NULL REFERENCES public.mission_hint_entries(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  hint_tier TEXT NOT NULL CHECK (hint_tier IN ('low', 'mid', 'high')),
  hint_body TEXT NOT NULL,
  activation_id UUID REFERENCES public.card_activations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_mission_hint_reveals_team_entry_key UNIQUE (team_id, mission_hint_entry_id)
);

CREATE INDEX IF NOT EXISTS team_mission_hint_reveals_team_idx
  ON public.team_mission_hint_reveals (team_id);

ALTER TABLE public.team_mission_hint_reveals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read own hint reveals" ON public.team_mission_hint_reveals;
CREATE POLICY "Participants read own hint reveals"
  ON public.team_mission_hint_reveals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_mission_hint_reveals.team_id
        AND t.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- ---------------------------------------------------------------------------
-- 3) Backfill mission_hint_entries from legacy card_hints (dedupe by mission+tier+body)
-- ---------------------------------------------------------------------------
INSERT INTO public.mission_hint_entries (mission_id, tier, body, is_active)
SELECT h.mission_id,
       CASE h.level
         WHEN 1 THEN 'low'
         WHEN 2 THEN 'mid'
         ELSE 'high'
       END AS tier,
       h.hint_text,
       h.is_active
FROM public.card_hints h
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mission_hint_entries e
  WHERE e.mission_id = h.mission_id
    AND e.tier = (
      CASE h.level
        WHEN 1 THEN 'low'
        WHEN 2 THEN 'mid'
        ELSE 'high'
      END
    )
    AND e.body = h.hint_text
);

-- ---------------------------------------------------------------------------
-- 4) Migrate cards.card_type enum → six values (multiple rows may share a type)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cards
  ALTER COLUMN card_type TYPE text USING (card_type::text);

DROP TYPE public.card_type;

UPDATE public.cards
SET card_type = CASE
  WHEN card_type = 'recovery' THEN 'healing'
  WHEN card_type = 'manipulation' THEN 'attack'
  WHEN card_type = 'protection' THEN 'defense'
  WHEN card_type = 'hint_single' AND COALESCE(hint_level, 1) = 1 THEN 'hint_low'
  WHEN card_type = 'hint_single' AND COALESCE(hint_level, 1) = 2 THEN 'hint_mid'
  WHEN card_type = 'hint_single' AND COALESCE(hint_level, 1) = 3 THEN 'hint_high'
  ELSE card_type
END;

UPDATE public.cards
SET hint_level = CASE card_type
  WHEN 'hint_low' THEN 1
  WHEN 'hint_mid' THEN 2
  WHEN 'hint_high' THEN 3
  ELSE COALESCE(hint_level, 1)
END;

UPDATE public.cards
SET reward_enabled = false,
    linked_mission_id = NULL
WHERE card_type IN ('hint_low', 'hint_mid', 'hint_high');

CREATE TYPE public.card_type AS ENUM (
  'attack',
  'defense',
  'healing',
  'hint_low',
  'hint_mid',
  'hint_high'
);

ALTER TABLE public.cards
  ALTER COLUMN card_type TYPE public.card_type USING (card_type::public.card_type);

-- ---------------------------------------------------------------------------
-- 5) admin_set_card_shop_config — hint types never in reward pool; no linked mission on hints
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_card_shop_config(
  p_card_id UUID,
  p_shop_price INTEGER,
  p_shop_visible BOOLEAN,
  p_shop_enabled BOOLEAN,
  p_effect_percent NUMERIC,
  p_effect_duration_minutes INTEGER,
  p_hint_level INTEGER,
  p_linked_mission_id UUID DEFAULT NULL,
  p_reward_enabled BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_type public.card_type;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can manage card shop configuration';
  END IF;

  SELECT card_type INTO v_card_type
  FROM public.cards
  WHERE id = p_card_id;

  IF v_card_type IS NULL THEN
    RAISE EXCEPTION 'Card not found';
  END IF;

  UPDATE public.cards
  SET shop_price = COALESCE(p_shop_price, shop_price),
      shop_visible = COALESCE(p_shop_visible, shop_visible),
      shop_enabled = COALESCE(p_shop_enabled, shop_enabled),
      reward_enabled = CASE
        WHEN v_card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN false
        ELSE COALESCE(p_reward_enabled, reward_enabled)
      END,
      effect_percent = COALESCE(p_effect_percent, effect_percent),
      effect_duration_minutes = COALESCE(p_effect_duration_minutes, effect_duration_minutes),
      hint_level = COALESCE(p_hint_level, hint_level),
      linked_mission_id = CASE
        WHEN v_card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN NULL
        WHEN p_linked_mission_id IS NOT NULL THEN p_linked_mission_id
        ELSE linked_mission_id
      END
  WHERE id = p_card_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) activate_team_card — mission picker support, mission hint pool, no card spend on mission pick
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_team_card(
  p_team_id UUID,
  p_card_id UUID,
  p_target_team_id UUID DEFAULT NULL,
  p_mission_id UUID DEFAULT NULL
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
  v_hint_entry public.mission_hint_entries%ROWTYPE;
  v_defense_count INTEGER;
  v_before_health NUMERIC;
  v_after_health NUMERIC;
  v_effect_result JSONB := '{}'::jsonb;
  v_mission_id UUID;
  v_mission_count INTEGER;
  v_missions_json JSONB;
  v_action_type TEXT;
  v_activation_id UUID;
  v_hint_tier TEXT;
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

  -- Pre-flight: attack needs valid target (before consuming a card)
  IF v_card.card_type = 'attack' THEN
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
  END IF;

  -- Pre-flight: hint cards — resolve active missions and hint availability
  IF v_card.card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN
    v_hint_tier := CASE v_card.card_type::text
      WHEN 'hint_low' THEN 'low'
      WHEN 'hint_mid' THEN 'mid'
      WHEN 'hint_high' THEN 'high'
    END;

    SELECT COUNT(*) INTO v_mission_count
    FROM public.missions
    WHERE enabled = true
      AND visible = true
      AND is_open = true;

    IF v_mission_count = 0 THEN
      RAISE EXCEPTION 'No active mission available for hints';
    END IF;

    IF v_mission_count = 1 THEN
      SELECT id INTO v_mission_id
      FROM public.missions
      WHERE enabled = true
        AND visible = true
        AND is_open = true
      ORDER BY sequence_number NULLS LAST, created_at
      LIMIT 1;
    ELSE
      IF p_mission_id IS NULL THEN
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'name', m.name,
              'sequence_number', m.sequence_number
            )
            ORDER BY m.sequence_number NULLS LAST, m.created_at
          ),
          '[]'::jsonb
        )
        INTO v_missions_json
        FROM public.missions m
        WHERE m.enabled = true
          AND m.visible = true
          AND m.is_open = true;

        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MISSION_SELECTION_REQUIRED',
          'missions', v_missions_json
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.missions mm
        WHERE mm.id = p_mission_id
          AND mm.enabled = true
          AND mm.visible = true
          AND mm.is_open = true
      ) THEN
        RAISE EXCEPTION 'Selected mission is not active for hints';
      END IF;

      v_mission_id := p_mission_id;
    END IF;

    SELECT * INTO v_hint_entry
    FROM public.mission_hint_entries e
    WHERE e.mission_id = v_mission_id
      AND e.tier = v_hint_tier
      AND e.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_mission_hint_reveals r
        WHERE r.team_id = v_team.id
          AND r.mission_hint_entry_id = e.id
      )
    ORDER BY random()
    LIMIT 1;

    IF v_hint_entry.id IS NULL THEN
      RAISE EXCEPTION 'No unused hint available for this team at this level for the selected mission';
    END IF;
  END IF;

  PERFORM public.apply_card_delta(v_team.id, v_card.id, -1);

  IF v_card.card_type = 'healing' THEN
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
  ELSIF v_card.card_type = 'attack' THEN
    v_action_type := 'attack';

    SELECT COUNT(*) INTO v_defense_count
    FROM public.team_card_defenses d
    WHERE d.team_id = v_target.id
      AND d.expires_at > now();

    IF v_defense_count > 0 THEN
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
  ELSIF v_card.card_type = 'defense' THEN
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
  ELSIF v_card.card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN
    v_action_type := 'hint';

    v_effect_result := jsonb_build_object(
      'effect', 'hint',
      'mission_id', v_mission_id,
      'mission_name', (SELECT mm.name FROM public.missions mm WHERE mm.id = v_mission_id),
      'tier', v_hint_tier,
      'hint_text', v_hint_entry.body,
      'mission_hint_entry_id', v_hint_entry.id
    );

    INSERT INTO public.notifications (user_id, team_id, type, title, message)
    VALUES (
      auth.uid(),
      v_team.id,
      'announcement',
      'Hint unlocked',
      'A new hint was saved under My Hints.'
    );
  ELSE
    RAISE EXCEPTION 'Unsupported card type';
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

  IF v_action_type = 'hint' THEN
    INSERT INTO public.team_mission_hint_reveals (
      team_id,
      mission_id,
      mission_hint_entry_id,
      card_id,
      hint_tier,
      hint_body,
      activation_id
    ) VALUES (
      v_team.id,
      v_mission_id,
      v_hint_entry.id,
      v_card.id,
      v_hint_tier,
      v_hint_entry.body,
      v_activation_id
    );
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
  p_target_team_id UUID DEFAULT NULL,
  p_mission_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.activate_team_card(p_team_id, p_card_id, p_target_team_id, p_mission_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Mission completion coffre — rank 1→3, 2→2, 3→2, else 1; reward pool combat types only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_static_mission(
  p_mission_number INTEGER,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_mission public.missions;
  v_part public.mission_participations;
  v_valid BOOLEAN := false;
  v_password_hash TEXT;
  v_resource RECORD;
  v_completion_position INTEGER;
  v_card_count INTEGER;
  v_reward_card UUID;
  v_coffre_id UUID;
  v_tier_id UUID;
  v_reward_cards JSONB := '[]'::jsonb;
  v_slot INTEGER;
BEGIN
  IF p_mission_number < 1 OR p_mission_number > 5 THEN
    RAISE EXCEPTION 'Only missions 1 to 5 are password-completed';
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant team not found';
  END IF;

  SELECT * INTO v_mission
  FROM public.missions
  WHERE id = public.static_mission_id(p_mission_number);

  SELECT * INTO v_part
  FROM public.mission_participations
  WHERE team_id = v_team.id
    AND mission_id = v_mission.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join mission before completion';
  END IF;

  IF v_part.status = 'completed' THEN
    RAISE EXCEPTION 'Mission already completed';
  END IF;

  IF p_mission_number IN (1, 2) THEN
    SELECT COALESCE(tmp.finish_password_hash, tmp.entry_password_hash) INTO v_password_hash
    FROM public.team_mission_passwords tmp
    WHERE tmp.team_id = v_team.id AND tmp.mission_id = v_mission.id;

    IF v_password_hash IS NOT NULL THEN
      v_valid := extensions.crypt(p_password, v_password_hash) = v_password_hash;
    ELSE
      v_valid := extensions.crypt(p_password, v_mission.finish_password_hash) = v_mission.finish_password_hash;
    END IF;
  ELSE
    v_valid := extensions.crypt(p_password, v_mission.finish_password_hash) = v_mission.finish_password_hash;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_PASSWORD';
  END IF;

  UPDATE public.mission_participations
  SET status = 'completed',
      completed_at = now(),
      exit_requested_at = now()
  WHERE id = v_part.id
  RETURNING * INTO v_part;

  PERFORM pg_advisory_xact_lock(hashtext(v_mission.id::text)::bigint);

  INSERT INTO public.mission_completions (mission_id, team_id, completion_position, completed_at)
  VALUES (
    v_mission.id,
    v_team.id,
    COALESCE((SELECT MAX(mc.completion_position) + 1 FROM public.mission_completions mc WHERE mc.mission_id = v_mission.id), 1),
    now()
  )
  ON CONFLICT (mission_id, team_id) DO NOTHING
  RETURNING completion_position INTO v_completion_position;

  IF v_completion_position IS NULL THEN
    SELECT completion_position
    INTO v_completion_position
    FROM public.mission_completions
    WHERE mission_id = v_mission.id
      AND team_id = v_team.id;
  END IF;

  v_card_count := CASE
    WHEN v_completion_position = 1 THEN 3
    WHEN v_completion_position IN (2, 3) THEN 2
    ELSE 1
  END;

  SELECT id
  INTO v_tier_id
  FROM public.coffre_tiers
  WHERE rank_label = CASE
    WHEN v_completion_position = 1 THEN '1st Place'
    WHEN v_completion_position = 2 THEN '2nd Place'
    WHEN v_completion_position = 3 THEN '3rd Place'
    ELSE '4th+'
  END
  LIMIT 1;

  IF v_tier_id IS NULL THEN
    SELECT id INTO v_tier_id
    FROM public.coffre_tiers
    ORDER BY created_at
    LIMIT 1;
  END IF;

  INSERT INTO public.coffres (team_id, tier_id, coffre_type, source_label)
  VALUES (
    v_team.id,
    v_tier_id,
    'game_reward',
    format('Mission %s completion', p_mission_number)
  )
  RETURNING id INTO v_coffre_id;

  FOR v_slot IN 1..v_card_count LOOP
    SELECT c.id
    INTO v_reward_card
    FROM public.cards c
    WHERE c.shop_enabled = true
      AND COALESCE(c.reward_enabled, true) = true
      AND c.card_type IN ('attack', 'defense', 'healing')
    ORDER BY random()
    LIMIT 1;

    IF v_reward_card IS NULL THEN
      RAISE EXCEPTION 'No rewardable cards configured. Enable at least one attack, defense, or healing card in admin shop.';
    END IF;

    INSERT INTO public.coffre_cards (coffre_id, card_id)
    VALUES (v_coffre_id, v_reward_card);

    PERFORM public.apply_card_delta(v_team.id, v_reward_card, 1);

    INSERT INTO public.mission_rewards (mission_id, team_id, card_id, completion_position, reward_slot)
    VALUES (v_mission.id, v_team.id, v_reward_card, v_completion_position, v_slot);

    v_reward_cards := v_reward_cards || jsonb_build_array(
      jsonb_build_object(
        'slot', v_slot,
        'card_id', v_reward_card
      )
    );
  END LOOP;

  INSERT INTO public.notifications (user_id, team_id, type, title, message, metadata)
  VALUES (
    v_team.user_id,
    v_team.id,
    'coffre_awarded',
    'Mission Reward Coffre',
    format(
      'Mission %s completed. You finished rank #%s and received a %s-card coffre.',
      p_mission_number,
      v_completion_position,
      v_card_count
    ),
    jsonb_build_object(
      'mission_id', v_mission.id,
      'mission_number', p_mission_number,
      'completion_position', v_completion_position,
      'coffre_id', v_coffre_id,
      'cards', v_reward_cards
    )
  );

  IF p_mission_number IN (4, 5) THEN
    SELECT * INTO v_resource
    FROM public.mission_static_resources
    WHERE mission_number = p_mission_number;

    IF FOUND THEN
      INSERT INTO public.team_mission_static_resources (team_id, mission_number, resource_type, resource_value)
      VALUES (v_team.id, p_mission_number, v_resource.resource_type, v_resource.resource_value)
      ON CONFLICT (team_id, mission_number)
      DO UPDATE SET
        resource_type = EXCLUDED.resource_type,
        resource_value = EXCLUDED.resource_value,
        granted_at = now();

      RETURN jsonb_build_object(
        'success', true,
        'resource_type', v_resource.resource_type,
        'resource_value', v_resource.resource_value,
        'completion_position', v_completion_position,
        'reward_card_count', v_card_count,
        'coffre_id', v_coffre_id,
        'reward_cards', v_reward_cards
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'completion_position', v_completion_position,
    'reward_card_count', v_card_count,
    'coffre_id', v_coffre_id,
    'reward_cards', v_reward_cards
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Legacy reward helper — align types / ranks with coffre rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribute_mission_rewards(
  p_mission_id UUID,
  p_team_id UUID,
  p_completion_position INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_count INTEGER;
  v_reward_cards UUID[];
  v_reward_card UUID;
  i INTEGER;
BEGIN
  v_card_count := CASE
    WHEN p_completion_position = 1 THEN 3
    WHEN p_completion_position IN (2, 3) THEN 2
    ELSE 1
  END;

  SELECT ARRAY_AGG(id)
  INTO v_reward_cards
  FROM (
    SELECT id
    FROM public.cards
    WHERE shop_visible = true
      AND shop_enabled = true
      AND COALESCE(reward_enabled, true) = true
      AND card_type IN ('attack', 'defense', 'healing')
    ORDER BY random()
    LIMIT v_card_count
  ) sub;

  IF v_reward_cards IS NULL THEN
    RETURN;
  END IF;

  FOR i IN 1 .. COALESCE(ARRAY_LENGTH(v_reward_cards, 1), 0) LOOP
    v_reward_card := v_reward_cards[i];
    INSERT INTO public.mission_rewards (
      mission_id, team_id, card_id, completion_position
    ) VALUES (
      p_mission_id, p_team_id, v_reward_card, p_completion_position
    );
  END LOOP;
END;
$$;
