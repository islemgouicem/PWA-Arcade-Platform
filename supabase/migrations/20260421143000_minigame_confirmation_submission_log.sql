-- Mini-game holder confirmation + submission log
-- - Keeps backend as source of truth
-- - Stores one immutable log per mini-game submission

CREATE TABLE IF NOT EXISTS public.mini_game_submission_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_game_id UUID NOT NULL UNIQUE REFERENCES public.mini_games(id) ON DELETE CASCADE,
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submission_items JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mini_game_submission_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mini_game_submission_logs'
      AND policyname = 'Holders and admins can view submission logs'
  ) THEN
    CREATE POLICY "Holders and admins can view submission logs"
    ON public.mini_game_submission_logs
    FOR SELECT
    USING (
      public.has_role_text(auth.uid(), 'mini_game_holder')
      OR public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_mini_game_rankings(
  p_mini_game_id UUID,
  p_password TEXT,
  p_rankings JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.mini_games;
  v_item JSONB;
  v_team_id UUID;
  v_rank INTEGER;
  v_points INTEGER;
  v_team public.teams;
  v_expected_count INTEGER;
  v_payload_count INTEGER;
  v_distinct_payload_teams INTEGER;
  v_distinct_payload_ranks INTEGER;
  v_submission_items JSONB;
BEGIN
  IF NOT (
    public.has_role_text(auth.uid(), 'mini_game_holder')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_game
  FROM public.mini_games
  WHERE id = p_mini_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.is_open = false THEN
    RAISE EXCEPTION 'Mini-game not available';
  END IF;

  IF v_game.is_completed THEN
    RAISE EXCEPTION 'Mini-game rankings already submitted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mini_game_submission_logs WHERE mini_game_id = p_mini_game_id
  ) THEN
    RAISE EXCEPTION 'Mini-game submission log already exists';
  END IF;

  IF v_game.holder_password_hash IS NULL THEN
    RAISE EXCEPTION 'Mini-game holder password not configured';
  END IF;

  IF v_game.holder_password_hash LIKE '$2%' THEN
    IF v_game.holder_password_hash <> extensions.crypt(p_password, v_game.holder_password_hash) THEN
      RAISE EXCEPTION 'Invalid mini-game holder password';
    END IF;
  ELSE
    IF v_game.holder_password_hash <> p_password THEN
      RAISE EXCEPTION 'Invalid mini-game holder password';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_expected_count
  FROM public.mini_game_joins j
  WHERE j.mini_game_id = p_mini_game_id
    AND j.is_active = true;

  IF v_expected_count = 0 THEN
    RAISE EXCEPTION 'No active joined teams for this mini-game';
  END IF;

  SELECT COUNT(*) INTO v_payload_count
  FROM jsonb_array_elements(p_rankings);

  SELECT COUNT(DISTINCT (x->>'team_id')) INTO v_distinct_payload_teams
  FROM jsonb_array_elements(p_rankings) x;

  SELECT COUNT(DISTINCT ((x->>'ranking')::INTEGER)) INTO v_distinct_payload_ranks
  FROM jsonb_array_elements(p_rankings) x;

  IF v_payload_count <> v_expected_count THEN
    RAISE EXCEPTION 'All joined teams must be ranked exactly once';
  END IF;

  IF v_distinct_payload_teams <> v_expected_count THEN
    RAISE EXCEPTION 'Duplicate team entries in rankings payload';
  END IF;

  IF v_distinct_payload_ranks <> v_expected_count THEN
    RAISE EXCEPTION 'Duplicate ranks are not allowed';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rankings)
  LOOP
    v_team_id := (v_item->>'team_id')::UUID;
    v_rank := (v_item->>'ranking')::INTEGER;

    IF v_rank IS NULL OR v_rank <= 0 THEN
      RAISE EXCEPTION 'Invalid rank for team %', v_team_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.mini_game_joins j
      WHERE j.mini_game_id = p_mini_game_id
        AND j.team_id = v_team_id
        AND j.is_active = true
    ) THEN
      RAISE EXCEPTION 'Team % did not join this mini-game', v_team_id;
    END IF;

    SELECT rp.points_awarded INTO v_points
    FROM public.mini_game_rank_points rp
    WHERE rp.mini_game_id = p_mini_game_id
      AND rp.rank_position = v_rank;

    IF v_points IS NULL THEN
      v_points := 0;
    END IF;

    INSERT INTO public.mini_game_rankings (
      mini_game_id,
      team_id,
      ranking,
      points_awarded,
      entered_by_user_id
    ) VALUES (
      p_mini_game_id,
      v_team_id,
      v_rank,
      v_points,
      auth.uid()
    );

    UPDATE public.teams
    SET points = points + v_points
    WHERE id = v_team_id;

    IF v_points > 0 THEN
      SELECT * INTO v_team FROM public.teams WHERE id = v_team_id;
      IF FOUND THEN
        INSERT INTO public.notifications (user_id, team_id, type, title, message)
        VALUES (
          v_team.user_id,
          v_team.id,
          'announcement',
          'Mini-Game Points Awarded',
          format('Completed in %s: Rank #%s, +%s points.', v_game.name, v_rank, v_points)
        );
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', t.id,
        'team_name', t.team_name,
        'ranking', r.ranking,
        'points_awarded', r.points_awarded
      )
      ORDER BY r.ranking ASC
    ),
    '[]'::jsonb
  ) INTO v_submission_items
  FROM public.mini_game_rankings r
  JOIN public.teams t ON t.id = r.team_id
  WHERE r.mini_game_id = p_mini_game_id;

  INSERT INTO public.mini_game_submission_logs (
    mini_game_id,
    submitted_by_user_id,
    submission_items
  ) VALUES (
    p_mini_game_id,
    auth.uid(),
    v_submission_items
  );

  UPDATE public.mini_game_joins
  SET is_active = false
  WHERE mini_game_id = p_mini_game_id
    AND is_active = true;

  UPDATE public.mini_games
  SET is_completed = true,
      completed_at = now(),
      rankings_submitted_by_user_id = auth.uid(),
      is_open = false
  WHERE id = p_mini_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_override_reset_mini_game_submission(
  p_mini_game_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.mini_games;
  v_old RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can override mini-game submission';
  END IF;

  SELECT * INTO v_game
  FROM public.mini_games
  WHERE id = p_mini_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mini-game not found';
  END IF;

  FOR v_old IN
    SELECT team_id, points_awarded
    FROM public.mini_game_rankings
    WHERE mini_game_id = p_mini_game_id
  LOOP
    UPDATE public.teams
    SET points = GREATEST(points - COALESCE(v_old.points_awarded, 0), 0)
    WHERE id = v_old.team_id;
  END LOOP;

  DELETE FROM public.mini_game_rankings
  WHERE mini_game_id = p_mini_game_id;

  DELETE FROM public.mini_game_submission_logs
  WHERE mini_game_id = p_mini_game_id;

  UPDATE public.mini_game_joins
  SET is_active = true
  WHERE mini_game_id = p_mini_game_id;

  UPDATE public.mini_games
  SET is_completed = false,
      completed_at = NULL,
      rankings_submitted_by_user_id = NULL,
      is_open = true
  WHERE id = p_mini_game_id;
END;
$$;
