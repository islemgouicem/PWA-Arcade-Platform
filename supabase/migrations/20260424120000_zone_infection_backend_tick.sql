-- Backend-driven zone infection tick.
-- Health reduction is computed server-side from elapsed time and zone infection_rate.
-- This avoids frontend timer drift/pause issues (PWA/iOS backgrounding).

CREATE OR REPLACE FUNCTION public.get_zone_entries_for_team(
  p_team_id UUID DEFAULT NULL
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
  v_inside_elapsed NUMERIC;
  r RECORD;
BEGIN
  IF public.has_role(auth.uid(), 'admin') AND p_team_id IS NOT NULL THEN
    v_team_id := p_team_id;
  ELSE
    SELECT t.id INTO v_team_id
    FROM public.teams t
    WHERE t.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE id = v_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_health := COALESCE(v_team.health_status, 100);

  -- Server-side infection tick for active zone states.
  FOR r IN
    SELECT
      ze.id,
      ze.last_health_tick_at,
      ze.last_entered_at,
      ze.status,
      mz.infection_rate
    FROM public.zone_entries ze
    JOIN public.mission_zones mz ON mz.id = ze.zone_id
    WHERE ze.team_id = v_team_id
      AND ze.status IN ('inside', 'exit_requested')
    FOR UPDATE OF ze
  LOOP
    IF r.last_health_tick_at IS NULL THEN
      UPDATE public.zone_entries
      SET last_health_tick_at = v_now
      WHERE id = r.id;
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
    WHERE id = r.id;

    IF v_health <= 0 THEN
      -- Team health reached zero while in an infected zone.
      PERFORM public.apply_health_penalty_and_suspend(v_team_id);

      v_inside_elapsed := COALESCE(EXTRACT(EPOCH FROM (v_now - COALESCE(r.last_entered_at, v_now))), 0);

      UPDATE public.zone_entries
      SET status = 'exited',
          exited_at = v_now,
          total_inside_seconds = total_inside_seconds + GREATEST(v_inside_elapsed::INTEGER, 0)
      WHERE id = r.id;
      EXIT;
    END IF;
  END LOOP;

  UPDATE public.teams
  SET health_status = v_health
  WHERE id = v_team_id;

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
  FROM public.zone_entries ze
  JOIN public.mission_zones mz ON mz.id = ze.zone_id
  WHERE ze.team_id = v_team_id
    AND ze.status IN ('pending', 'inside', 'exit_requested')
  ORDER BY ze.entry_requested_at DESC;
END;
$$;
