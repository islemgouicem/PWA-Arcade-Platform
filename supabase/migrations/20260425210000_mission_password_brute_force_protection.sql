-- =============================================================================
-- Brute-force protection for mission completion passwords
--   * Tracks every failed/successful password attempt (per team, per mission).
--   * Enforces an admin-configurable rate limit:
--       password_max_attempts      (default 5)
--       password_window_minutes    (default 5)
--       password_lockout_minutes   (default 5)
--   * When a team crosses the threshold, admins receive a notification.
--   * Lockout is per (team, mission). Other missions are unaffected.
--
-- Compatibility:
--   * complete_static_mission keeps its signature and JSONB return type.
--   * Wrong-password and lockout responses are now returned as JSON
--     ({ "error": "INVALID_PASSWORD" } / { "error": "LOCKED_OUT", ... })
--     instead of RAISE EXCEPTION, so the failed-attempt INSERT is NOT
--     rolled back with the rest of the transaction.
--   * All other RAISE EXCEPTION paths (already-completed, not-joined, etc.)
--     are preserved.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Attempts log table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mission_password_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL REFERENCES public.teams(id)    ON DELETE CASCADE,
  mission_id      UUID        NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  was_successful  BOOLEAN     NOT NULL,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpwa_team_mission_time
  ON public.mission_password_attempts (team_id, mission_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_mpwa_failed_recent
  ON public.mission_password_attempts (team_id, mission_id, attempted_at DESC)
  WHERE was_successful = false;

ALTER TABLE public.mission_password_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_password_attempts" ON public.mission_password_attempts;
CREATE POLICY "admins_read_password_attempts"
  ON public.mission_password_attempts
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- 2) Default platform settings (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value)
VALUES
  ('password_max_attempts',    to_jsonb(5)),
  ('password_window_minutes',  to_jsonb(5)),
  ('password_lockout_minutes', to_jsonb(5))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Helper: numeric setting reader
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._read_password_setting(p_key TEXT, p_default INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw JSONB;
  v_val INTEGER;
BEGIN
  SELECT value INTO v_raw FROM public.platform_settings WHERE key = p_key;
  IF v_raw IS NULL THEN
    RETURN p_default;
  END IF;
  BEGIN
    v_val := (v_raw #>> '{}')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_val := p_default;
  END;
  IF v_val IS NULL OR v_val <= 0 THEN
    RETURN p_default;
  END IF;
  RETURN v_val;
END;
$$;

REVOKE ALL ON FUNCTION public._read_password_setting(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._read_password_setting(TEXT, INTEGER) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Helper: lockout state for (team, mission)
--      Returns NULL if not locked, else seconds remaining.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mission_password_lockout_remaining_seconds(
  p_team_id    UUID,
  p_mission_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max     INTEGER := public._read_password_setting('password_max_attempts',   5);
  v_window  INTEGER := public._read_password_setting('password_window_minutes', 5);
  v_lock    INTEGER := public._read_password_setting('password_lockout_minutes', 5);
  v_count   INTEGER;
  v_last    TIMESTAMPTZ;
  v_until   TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*), MAX(attempted_at)
    INTO v_count, v_last
  FROM public.mission_password_attempts
  WHERE team_id    = p_team_id
    AND mission_id = p_mission_id
    AND was_successful = false
    AND attempted_at >= now() - make_interval(mins => v_window);

  IF v_count IS NULL OR v_count < v_max OR v_last IS NULL THEN
    RETURN NULL;
  END IF;

  v_until := v_last + make_interval(mins => v_lock);
  IF v_until <= now() THEN
    RETURN NULL;
  END IF;

  RETURN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_until - now())))::INTEGER);
END;
$$;

REVOKE ALL ON FUNCTION public.mission_password_lockout_remaining_seconds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mission_password_lockout_remaining_seconds(UUID, UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Admin RPC: list currently locked-out (team, mission) pairs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_password_lockouts()
RETURNS TABLE (
  team_id            UUID,
  team_name          TEXT,
  mission_id         UUID,
  mission_number     INTEGER,
  failed_attempts    INTEGER,
  last_attempt       TIMESTAMPTZ,
  remaining_seconds  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window INTEGER := public._read_password_setting('password_window_minutes', 5);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      a.team_id,
      a.mission_id,
      COUNT(*)::INTEGER          AS failed_attempts,
      MAX(a.attempted_at)        AS last_attempt
    FROM public.mission_password_attempts a
    WHERE a.was_successful = false
      AND a.attempted_at >= now() - make_interval(mins => v_window)
    GROUP BY a.team_id, a.mission_id
  )
  SELECT
    agg.team_id,
    t.team_name,
    agg.mission_id,
    m.mission_number,
    agg.failed_attempts,
    agg.last_attempt,
    public.mission_password_lockout_remaining_seconds(agg.team_id, agg.mission_id) AS remaining_seconds
  FROM agg
  JOIN public.teams    t ON t.id = agg.team_id
  JOIN public.missions m ON m.id = agg.mission_id
  WHERE public.mission_password_lockout_remaining_seconds(agg.team_id, agg.mission_id) IS NOT NULL
  ORDER BY agg.last_attempt DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_password_lockouts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_password_lockouts() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Admin RPC: clear a lockout (deletes recent failed attempts in window)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_clear_mission_password_lockout(
  p_team_id    UUID,
  p_mission_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window  INTEGER := public._read_password_setting('password_window_minutes', 5);
  v_lock    INTEGER := public._read_password_setting('password_lockout_minutes', 5);
  v_deleted INTEGER;
  v_horizon INTERVAL;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Delete any failed attempts that could still be contributing to a lockout.
  v_horizon := make_interval(mins => GREATEST(v_window, v_lock));

  DELETE FROM public.mission_password_attempts
  WHERE team_id    = p_team_id
    AND mission_id = p_mission_id
    AND was_successful = false
    AND attempted_at >= now() - v_horizon;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('cleared_attempts', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_mission_password_lockout(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_mission_password_lockout(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Replace complete_static_mission with brute-force-aware version.
--    Wrong-password & lockout return JSON; everything else preserved.
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

  v_max_attempts    INTEGER;
  v_window_minutes  INTEGER;
  v_lockout_minutes INTEGER;
  v_lock_remaining  INTEGER;
  v_recent_failures INTEGER;
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

  -- ---- Brute-force gate (BEFORE password check) -----------------------
  v_max_attempts    := public._read_password_setting('password_max_attempts',   5);
  v_window_minutes  := public._read_password_setting('password_window_minutes', 5);
  v_lockout_minutes := public._read_password_setting('password_lockout_minutes', 5);

  v_lock_remaining := public.mission_password_lockout_remaining_seconds(v_team.id, v_mission.id);
  IF v_lock_remaining IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'LOCKED_OUT',
      'remaining_seconds', v_lock_remaining,
      'lockout_minutes',   v_lockout_minutes,
      'window_minutes',    v_window_minutes,
      'max_attempts',      v_max_attempts
    );
  END IF;

  -- ---- Validate password ----------------------------------------------
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
    -- Log the failed attempt FIRST. We use RETURN (not RAISE) below so
    -- this INSERT is committed instead of being rolled back.
    INSERT INTO public.mission_password_attempts (team_id, mission_id, was_successful)
    VALUES (v_team.id, v_mission.id, false);

    -- Did this attempt just trigger the lockout threshold? Notify admins.
    SELECT COUNT(*)::INTEGER INTO v_recent_failures
    FROM public.mission_password_attempts
    WHERE team_id    = v_team.id
      AND mission_id = v_mission.id
      AND was_successful = false
      AND attempted_at >= now() - make_interval(mins => v_window_minutes);

    IF v_recent_failures = v_max_attempts THEN
      INSERT INTO public.notifications (user_id, team_id, type, title, message, metadata)
      SELECT
        ur.user_id,
        v_team.id,
        'security_alert',
        'Mission password lockout',
        format(
          'Team "%s" has been locked out of Mission %s after %s wrong password attempts. They cannot retry for %s minutes.',
          v_team.team_name,
          p_mission_number,
          v_recent_failures,
          v_lockout_minutes
        ),
        jsonb_build_object(
          'kind',           'mission_password_lockout',
          'team_id',        v_team.id,
          'mission_id',     v_mission.id,
          'mission_number', p_mission_number,
          'failed_attempts', v_recent_failures,
          'lockout_minutes', v_lockout_minutes
        )
      FROM public.user_roles ur
      WHERE ur.role = 'admin';
    END IF;

    v_lock_remaining := public.mission_password_lockout_remaining_seconds(v_team.id, v_mission.id);

    RETURN jsonb_build_object(
      'error',             'INVALID_PASSWORD',
      'attempts_in_window', v_recent_failures,
      'max_attempts',       v_max_attempts,
      'remaining_seconds',  v_lock_remaining
    );
  END IF;

  -- ---- Success: log success, then proceed with the original logic -----
  INSERT INTO public.mission_password_attempts (team_id, mission_id, was_successful)
  VALUES (v_team.id, v_mission.id, true);

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

REVOKE ALL ON FUNCTION public.complete_static_mission(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_static_mission(INTEGER, TEXT) TO authenticated;
