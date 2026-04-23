-- Mission reward hardening:
-- - Concurrency-safe completion ranking
-- - Guaranteed single coffre per mission/team completion
-- - Reward cards exclude hints
-- - Duplicate cards allowed in the same coffre
-- - Admin-configurable reward pool eligibility
-- - Anonymous attack notifications to targeted teams

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS reward_enabled BOOLEAN NOT NULL DEFAULT true;

-- Hint cards must never be mission reward draws.
UPDATE public.cards
SET reward_enabled = false
WHERE card_type = 'hint_single';

ALTER TABLE public.mission_rewards
  ADD COLUMN IF NOT EXISTS reward_slot INTEGER NOT NULL DEFAULT 1;

-- Backfill deterministic per-(mission,team) slots so unique(mission_id, team_id, reward_slot)
-- can be added on existing databases that already contain multiple reward rows.
WITH ranked_rewards AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY mission_id, team_id
      ORDER BY COALESCE(distributed_at, now()), id
    ) AS rn
  FROM public.mission_rewards
)
UPDATE public.mission_rewards mr
SET reward_slot = rr.rn
FROM ranked_rewards rr
WHERE mr.id = rr.id
  AND mr.reward_slot IS DISTINCT FROM rr.rn;

-- Replace unique(mission_id, team_id, card_id) with unique(mission_id, team_id, reward_slot)
-- so duplicate card IDs are allowed for the same mission reward coffre.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname
  INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'mission_rewards'
    AND con.contype = 'u'
    AND con.conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'mission_id' AND NOT attisdropped),
      (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'team_id' AND NOT attisdropped),
      (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'card_id' AND NOT attisdropped)
    ]::smallint[];

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.mission_rewards DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mission_rewards_mission_team_slot_key'
  ) THEN
    ALTER TABLE public.mission_rewards
      ADD CONSTRAINT mission_rewards_mission_team_slot_key UNIQUE (mission_id, team_id, reward_slot);
  END IF;
END $$;

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
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can manage card shop configuration';
  END IF;

  UPDATE public.cards
  SET shop_price = COALESCE(p_shop_price, shop_price),
      shop_visible = COALESCE(p_shop_visible, shop_visible),
      shop_enabled = COALESCE(p_shop_enabled, shop_enabled),
      reward_enabled = CASE
        WHEN card_type = 'hint_single' THEN false
        ELSE COALESCE(p_reward_enabled, reward_enabled)
      END,
      effect_percent = COALESCE(p_effect_percent, effect_percent),
      effect_duration_minutes = COALESCE(p_effect_duration_minutes, effect_duration_minutes),
      hint_level = COALESCE(p_hint_level, hint_level),
      linked_mission_id = p_linked_mission_id
  WHERE id = p_card_id;
END;
$$;

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

  -- Serialize rank assignment per mission to avoid race conditions.
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

  FOR v_slot IN 1..v_card_count LOOP
    -- Duplicates intentionally allowed: each slot draws independently.
    SELECT c.id
    INTO v_reward_card
    FROM public.cards c
    WHERE c.shop_enabled = true
      AND COALESCE(c.reward_enabled, true) = true
      AND c.card_type IN ('recovery', 'manipulation', 'protection')
    ORDER BY random()
    LIMIT 1;

    IF v_reward_card IS NULL THEN
      RAISE EXCEPTION 'No rewardable cards configured. Enable at least one healing/attack/defense card in admin shop.';
    END IF;

    INSERT INTO public.coffre_cards (coffre_id, card_id)
    VALUES (v_coffre_id, v_reward_card);

    -- Inventory grant remains immediate for gameplay continuity.
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

CREATE OR REPLACE FUNCTION public.notify_target_team_attack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.teams;
  v_blocked BOOLEAN := false;
  v_health_after NUMERIC;
BEGIN
  IF NEW.action_type <> 'attack' OR NEW.target_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_target
  FROM public.teams
  WHERE id = NEW.target_team_id;

  IF v_target.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_blocked := COALESCE((NEW.effect_result ->> 'blocked')::boolean, false);
  v_health_after := NULLIF(NEW.effect_result ->> 'health_after', '')::numeric;

  INSERT INTO public.notifications (user_id, team_id, type, title, message, metadata)
  VALUES (
    v_target.user_id,
    v_target.id,
    'card_activated',
    CASE WHEN v_blocked THEN 'Incoming Attack Blocked' ELSE 'Your Team Was Attacked' END,
    CASE
      WHEN v_blocked THEN 'Your active defense blocked an incoming attack.'
      ELSE 'Your team took damage from an incoming attack.'
    END,
    jsonb_build_object(
      'event', 'incoming_attack',
      'blocked', v_blocked,
      'health_after', v_health_after
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_target_team_attack ON public.card_activations;
CREATE TRIGGER trg_notify_target_team_attack
AFTER INSERT ON public.card_activations
FOR EACH ROW
EXECUTE FUNCTION public.notify_target_team_attack();
