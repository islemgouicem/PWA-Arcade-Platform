-- Health-zero flow update:
-- - No suspension behavior.
-- - On health <= 0: apply points penalty + restore health to configured percentage.
-- - Keep team in zone (no forced zone exit).

-- Ensure config keys exist.
INSERT INTO public.platform_settings (key, value)
VALUES ('health_zero_penalty_points', to_jsonb(50))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value)
VALUES ('health_restore_percentage', to_jsonb(30))
ON CONFLICT (key) DO NOTHING;

-- Cleanup any legacy suspended states.
UPDATE public.teams
SET is_suspended = false,
    suspended_until = NULL
WHERE is_suspended = true
   OR suspended_until IS NOT NULL;

-- Keep legacy function name for compatibility with existing callers.
-- New behavior: penalty + instant health restore, no suspension.
CREATE OR REPLACE FUNCTION public.apply_health_penalty_and_suspend(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_penalty INTEGER := COALESCE(public.get_setting_number('health_zero_penalty_points', 50), 50)::INTEGER;
  v_restore NUMERIC := COALESCE(public.get_setting_number('health_restore_percentage', 30), 30);
  v_restore_clamped NUMERIC;
BEGIN
  v_restore_clamped := LEAST(100, GREATEST(1, v_restore));

  UPDATE public.teams
  SET points = GREATEST(points - GREATEST(v_penalty, 0), 0),
      health_status = v_restore_clamped,
      is_suspended = false,
      suspended_until = NULL,
      updated_at = now()
  WHERE id = p_team_id;
END;
$$;

-- Neutralize suspension refresh checks (legacy compatibility).
CREATE OR REPLACE FUNCTION public.refresh_team_suspension_state(p_team_id UUID)
RETURNS public.teams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
BEGIN
  UPDATE public.teams
  SET is_suspended = false,
      suspended_until = NULL
  WHERE id = p_team_id
    AND (is_suspended = true OR suspended_until IS NOT NULL);

  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id;

  RETURN v_team;
END;
$$;

-- Zone tick: keep team in zone when health reaches zero.
CREATE OR REPLACE FUNCTION public.get_zone_entries_for_team(
  p_team_id UUID
)
RETURNS TABLE (
  id UUID,
  zone_id UUID,
  team_id UUID,
  status TEXT,
  entry_requested_at TIMESTAMPTZ,
  mission_zones JSONB,
  current_health NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_team public.teams;
  v_now TIMESTAMPTZ := now();
  v_elapsed_seconds NUMERIC;
  v_elapsed_minutes NUMERIC;
  v_decrease NUMERIC;
  v_health NUMERIC;
  v_penalty_applied BOOLEAN := false;
  r RECORD;
BEGIN
  IF public.has_role(auth.uid(), 'admin') AND p_team_id IS NOT NULL THEN
    v_team_id := p_team_id;
  ELSE
    SELECT t.id INTO v_team_id
    FROM public.teams AS t
    WHERE t.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  SELECT t.* INTO v_team
  FROM public.teams AS t
  WHERE t.id = v_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_health := COALESCE(v_team.health_status, 100);

  FOR r IN
    SELECT
      ze.id AS zone_entry_id,
      ze.last_health_tick_at,
      mz.infection_rate
    FROM public.zone_entries AS ze
    JOIN public.mission_zones AS mz ON mz.id = ze.zone_id
    WHERE ze.team_id = v_team_id
      AND ze.status IN ('inside', 'exit_requested')
    FOR UPDATE OF ze
  LOOP
    IF r.last_health_tick_at IS NULL THEN
      UPDATE public.zone_entries
      SET last_health_tick_at = v_now
      WHERE public.zone_entries.id = r.zone_entry_id;
      CONTINUE;
    END IF;

    v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - r.last_health_tick_at));
    IF v_elapsed_seconds <= 0 THEN
      CONTINUE;
    END IF;

    v_elapsed_minutes := v_elapsed_seconds / 60.0;
    v_decrease := v_elapsed_minutes * COALESCE(r.infection_rate, 0);
    v_health := GREATEST(0, v_health - v_decrease);

    UPDATE public.zone_entries
    SET last_health_tick_at = v_now
    WHERE public.zone_entries.id = r.zone_entry_id;

    IF v_health <= 0 AND NOT v_penalty_applied THEN
      PERFORM public.apply_health_penalty_and_suspend(v_team_id);
      v_penalty_applied := true;

      SELECT COALESCE(t.health_status, 100) INTO v_health
      FROM public.teams t
      WHERE t.id = v_team_id;
    END IF;
  END LOOP;

  UPDATE public.teams
  SET health_status = v_health
  WHERE public.teams.id = v_team_id;

  RETURN QUERY
  SELECT
    ze.id,
    ze.zone_id,
    ze.team_id,
    ze.status,
    ze.entry_requested_at,
    jsonb_build_object(
      'name', mz.name,
      'zone_type', mz.zone_type,
      'infection_rate', mz.infection_rate
    ) AS mission_zones,
    v_health AS current_health
  FROM public.zone_entries AS ze
  JOIN public.mission_zones AS mz ON mz.id = ze.zone_id
  WHERE ze.team_id = v_team_id
    AND ze.status IN ('pending', 'inside', 'exit_requested')
  ORDER BY ze.entry_requested_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_zone_entries_for_team()
RETURNS TABLE (
  id UUID,
  zone_id UUID,
  team_id UUID,
  status TEXT,
  entry_requested_at TIMESTAMPTZ,
  mission_zones JSONB,
  current_health NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.get_zone_entries_for_team(NULL::UUID);
END;
$$;

-- Legacy mission-participation tick path: no forced outside on zero-health.
CREATE OR REPLACE FUNCTION public.tick_health_for_participation(p_participation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part RECORD;
  v_team public.teams;
  v_now TIMESTAMPTZ := now();
  v_elapsed_seconds NUMERIC;
  v_elapsed_minutes NUMERIC;
  v_base_rate NUMERIC := COALESCE(public.get_setting_number('health_base_decrease_rate_per_minute', 1), 1);
  v_total_rate NUMERIC;
  v_decrease NUMERIC;
  v_new_health NUMERIC;
BEGIN
  SELECT mp.*, m.infection_rate_per_minute
    INTO v_part
  FROM public.mission_participations mp
  JOIN public.missions m ON m.id = mp.mission_id
  WHERE mp.id = p_participation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_part.status NOT IN ('inside', 'pending_exit') THEN
    RETURN;
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE id = v_part.team_id;

  IF v_part.last_health_tick_at IS NULL THEN
    UPDATE public.mission_participations
    SET last_health_tick_at = v_now
    WHERE id = p_participation_id;
    RETURN;
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_part.last_health_tick_at));
  IF v_elapsed_seconds <= 0 THEN
    RETURN;
  END IF;

  v_elapsed_minutes := v_elapsed_seconds / 60.0;
  v_total_rate := v_base_rate + COALESCE(v_part.infection_rate_per_minute, 0);
  v_decrease := v_elapsed_minutes * v_total_rate;
  v_new_health := GREATEST(0, COALESCE(v_team.health_status, 100) - v_decrease);

  UPDATE public.mission_participations
  SET last_health_tick_at = v_now
  WHERE id = p_participation_id;

  IF v_new_health <= 0 THEN
    PERFORM public.apply_health_penalty_and_suspend(v_part.team_id);
  ELSE
    UPDATE public.teams
    SET health_status = v_new_health
    WHERE id = v_part.team_id;
  END IF;
END;
$$;
