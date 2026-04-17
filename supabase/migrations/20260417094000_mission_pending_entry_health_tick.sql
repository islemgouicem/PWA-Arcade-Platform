-- Align mission health behavior with UX: health starts decreasing at entry request

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

  IF v_part.status NOT IN ('pending_entry', 'inside', 'pending_exit') THEN
    RETURN;
  END IF;

  SELECT * INTO v_team FROM public.refresh_team_suspension_state(v_part.team_id);

  IF v_team.is_suspended THEN
    RETURN;
  END IF;

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

  UPDATE public.teams
  SET health_status = v_new_health
  WHERE id = v_part.team_id;

  UPDATE public.mission_participations
  SET last_health_tick_at = v_now
  WHERE id = p_participation_id;

  IF v_new_health <= 0 THEN
    PERFORM public.apply_health_penalty_and_suspend(v_part.team_id);

    UPDATE public.mission_participations
    SET status = 'outside',
        exit_requested_at = NULL,
        entry_requested_at = NULL,
        last_entered_at = NULL
    WHERE id = p_participation_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tick_all_mission_health()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM public.mission_participations
    WHERE status IN ('pending_entry', 'inside', 'pending_exit')
  LOOP
    PERFORM public.tick_health_for_participation(r.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_mission_entry(p_mission_id UUID)
RETURNS public.mission_participations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_part public.mission_participations;
BEGIN
  SELECT * INTO v_team
  FROM public.teams
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant team not found';
  END IF;

  SELECT * INTO v_team FROM public.refresh_team_suspension_state(v_team.id);

  IF v_team.is_suspended THEN
    RAISE EXCEPTION 'Team is suspended';
  END IF;

  SELECT * INTO v_part
  FROM public.mission_participations
  WHERE mission_id = p_mission_id
    AND team_id = v_team.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join mission before entering zone';
  END IF;

  IF v_part.status = 'completed' THEN
    RAISE EXCEPTION 'Mission already completed for this team';
  END IF;

  IF v_part.status NOT IN ('outside', 'pending_entry') THEN
    RAISE EXCEPTION 'Invalid state for entering zone';
  END IF;

  UPDATE public.mission_participations
  SET status = 'pending_entry',
      entry_requested_at = now(),
      last_entered_at = COALESCE(last_entered_at, now()),
      last_health_tick_at = COALESCE(last_health_tick_at, now())
  WHERE id = v_part.id
  RETURNING * INTO v_part;

  RETURN v_part;
END;
$$;
