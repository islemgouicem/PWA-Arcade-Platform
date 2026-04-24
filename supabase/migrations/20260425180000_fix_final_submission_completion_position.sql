-- Fix Mission 6 submission failure caused by duplicate completion_position.
-- mission_completions has UNIQUE (mission_id, completion_position), so we must
-- compute the next position per mission instead of hard-coding 1.

CREATE OR REPLACE FUNCTION public.submit_final_mission(
  p_mission_id UUID,
  p_document_path TEXT,
  p_document_name TEXT,
  p_submission_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_mission public.missions;
  v_next_position INT;
BEGIN
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  SELECT * INTO v_mission
  FROM public.missions
  WHERE id = p_mission_id
    AND is_final_submission = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Final mission not found');
  END IF;

  IF NOT public.can_access_final_mission(v_team_id) THEN
    RETURN jsonb_build_object('error', 'Not all prerequisites completed');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mission_submissions
    WHERE mission_id = p_mission_id
      AND team_id = v_team_id
  ) THEN
    RETURN jsonb_build_object('error', 'Submission already exists');
  END IF;

  INSERT INTO public.mission_submissions (
    mission_id, team_id, document_path, document_name, submission_data
  ) VALUES (
    p_mission_id, v_team_id, p_document_path, p_document_name, p_submission_data
  );

  UPDATE public.mission_participations
  SET status = 'completed',
      completed_at = now(),
      exit_requested_at = now()
  WHERE mission_id = p_mission_id
    AND team_id = v_team_id;

  -- Lock the mission row to serialize concurrent submissions when computing
  -- the next completion_position, so two teams cannot both land on the same
  -- value and hit the UNIQUE (mission_id, completion_position) violation.
  PERFORM 1
  FROM public.missions
  WHERE id = p_mission_id
  FOR UPDATE;

  SELECT COALESCE(MAX(completion_position), 0) + 1
  INTO v_next_position
  FROM public.mission_completions
  WHERE mission_id = p_mission_id;

  INSERT INTO public.mission_completions (
    mission_id, team_id, completion_position
  ) VALUES (
    p_mission_id, v_team_id, v_next_position
  )
  ON CONFLICT (mission_id, team_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Final submission received',
    'submitted_at', now(),
    'completion_position', v_next_position
  );
END;
$$;
