-- Remove baseline health drain from active logic.
-- Health decreases only by mission/zone infection rates.

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
  v_decrease := v_elapsed_minutes * COALESCE(v_part.infection_rate_per_minute, 0);
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
