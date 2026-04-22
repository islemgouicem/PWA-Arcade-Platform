-- Ensure static mission rewards also add cards directly into team inventory.

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
    WHEN v_completion_position = 2 THEN 2
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

  FOR v_reward_card IN
    SELECT c.id
    FROM public.cards c
    WHERE c.shop_visible = true
      AND c.shop_enabled = true
      AND c.card_type IN ('hint_single', 'recovery', 'manipulation', 'protection')
    ORDER BY RANDOM()
    LIMIT v_card_count
  LOOP
    INSERT INTO public.coffre_cards (coffre_id, card_id)
    VALUES (v_coffre_id, v_reward_card);

    PERFORM public.apply_card_delta(v_team.id, v_reward_card, 1);

    INSERT INTO public.mission_rewards (mission_id, team_id, card_id, completion_position)
    VALUES (v_mission.id, v_team.id, v_reward_card, v_completion_position);
  END LOOP;

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
        'coffre_id', v_coffre_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'completion_position', v_completion_position,
    'reward_card_count', v_card_count,
    'coffre_id', v_coffre_id
  );
END;
$$;
