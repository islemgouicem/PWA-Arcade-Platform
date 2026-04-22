-- Hard removal of legacy card types.
-- Keep only: hint_single, recovery, manipulation, protection.

DO $$
BEGIN
  -- Remove references that are not ON DELETE CASCADE.
  UPDATE public.side_quests
  SET reward_card_id = NULL
  WHERE reward_card_id IN (
    SELECT id
    FROM public.cards
    WHERE card_type NOT IN ('hint_single', 'recovery', 'manipulation', 'protection')
  );

  UPDATE public.trade_requests
  SET offered_card_id = NULL
  WHERE offered_card_id IN (
    SELECT id
    FROM public.cards
    WHERE card_type NOT IN ('hint_single', 'recovery', 'manipulation', 'protection')
  );

  UPDATE public.trade_requests
  SET wanted_card_id = NULL
  WHERE wanted_card_id IN (
    SELECT id
    FROM public.cards
    WHERE card_type NOT IN ('hint_single', 'recovery', 'manipulation', 'protection')
  );

  UPDATE public.missions
  SET mandatory_card_id = NULL
  WHERE mandatory_card_id IN (
    SELECT id
    FROM public.cards
    WHERE card_type NOT IN ('hint_single', 'recovery', 'manipulation', 'protection')
  );

  -- Hard delete unsupported cards. Cascading child rows are removed automatically.
  DELETE FROM public.cards
  WHERE card_type NOT IN ('hint_single', 'recovery', 'manipulation', 'protection');
END $$;

-- Shrink enum to exactly four values.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_type_new') THEN
    DROP TYPE public.card_type_new;
  END IF;
END $$;

CREATE TYPE public.card_type_new AS ENUM ('hint_single', 'recovery', 'manipulation', 'protection');

ALTER TABLE public.cards
  ALTER COLUMN card_type TYPE public.card_type_new
  USING (card_type::text::public.card_type_new);

DROP TYPE public.card_type;
ALTER TYPE public.card_type_new RENAME TO card_type;

-- Enforce four-type activation behavior at backend level.
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

  IF v_card.card_type = 'recovery' THEN
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
  ELSIF v_card.card_type = 'manipulation' THEN
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
  ELSIF v_card.card_type = 'hint_single' THEN
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
