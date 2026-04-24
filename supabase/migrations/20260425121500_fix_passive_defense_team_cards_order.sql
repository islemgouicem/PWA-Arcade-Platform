-- Hotfix: team_cards does not have created_at, so passive-defense lookup must not order by it.
-- Replace activate_team_card with a stable order that uses existing columns.

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
  v_before_health NUMERIC;
  v_after_health NUMERIC;
  v_effect_result JSONB := '{}'::jsonb;
  v_mission_id UUID;
  v_mission_count INTEGER;
  v_missions_json JSONB;
  v_action_type TEXT;
  v_activation_id UUID;
  v_hint_tier TEXT;
  v_defense_card_id UUID;
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

  IF v_card.card_type = 'defense' THEN
    RAISE EXCEPTION 'Defense cards are passive and cannot be activated directly';
  END IF;

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
      'amount', COALESCE(v_card.effect_percent, 0)
    );
  ELSIF v_card.card_type = 'attack' THEN
    v_action_type := 'attack';

    SELECT tc.card_id
    INTO v_defense_card_id
    FROM public.team_cards tc
    JOIN public.cards c ON c.id = tc.card_id
    WHERE tc.team_id = v_target.id
      AND tc.quantity > 0
      AND c.card_type = 'defense'
    ORDER BY tc.quantity DESC, tc.acquired_at NULLS LAST, tc.id
    FOR UPDATE OF tc
    LIMIT 1;

    IF v_defense_card_id IS NOT NULL THEN
      PERFORM public.apply_card_delta(v_target.id, v_defense_card_id, -1);

      v_effect_result := jsonb_build_object(
        'effect', 'attack',
        'blocked', true,
        'damage', 0
      );

      INSERT INTO public.notifications (user_id, team_id, type, title, message)
      VALUES (
        v_target.user_id,
        v_target.id,
        'announcement',
        'Attack Blocked',
        'You were attacked, but your defense card protected you.'
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
        'damage', COALESCE(v_card.effect_percent, 0)
      );

      INSERT INTO public.notifications (user_id, team_id, type, title, message)
      VALUES (
        v_target.user_id,
        v_target.id,
        'announcement',
        'Attack Received',
        format('You were attacked and lost %s%% health.', COALESCE(v_card.effect_percent, 0))
      );
    END IF;
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
