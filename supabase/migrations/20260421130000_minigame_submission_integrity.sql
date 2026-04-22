-- Mini-games integrity and completion model
-- - Completed only on holder ranking submission
-- - Points only rewards (no cards/items)
-- - Notify teams only when points_gained > 0
-- - Exactly-once submission per mini-game instance
-- - Only joined teams are eligible

ALTER TABLE public.mini_games
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rankings_submitted_by_user_id UUID REFERENCES auth.users(id);

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

    -- Points-only reward model
    UPDATE public.teams
    SET points = points + v_points
    WHERE id = v_team_id;

    -- Notify only if points gained > 0
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

  -- Completion state is set only when rankings are submitted
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

CREATE OR REPLACE FUNCTION public.join_mini_game(p_mini_game_id UUID)
RETURNS public.mini_game_joins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_game public.mini_games;
  v_join public.mini_game_joins;
BEGIN
  SELECT * INTO v_team
  FROM public.teams
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant team not found';
  END IF;

  SELECT * INTO v_team FROM public.refresh_team_suspension_state(v_team.id);

  IF v_team.is_suspended THEN
    RAISE EXCEPTION 'Team is suspended and cannot join mini-games';
  END IF;

  SELECT * INTO v_game FROM public.mini_games WHERE id = p_mini_game_id;

  IF NOT FOUND OR v_game.is_open = false THEN
    RAISE EXCEPTION 'Mini-game is not open';
  END IF;

  IF v_game.is_completed THEN
    RAISE EXCEPTION 'Mini-game is already completed';
  END IF;

  INSERT INTO public.mini_game_joins (mini_game_id, team_id, joined_at, is_active)
  VALUES (p_mini_game_id, v_team.id, now(), true)
  ON CONFLICT (mini_game_id, team_id)
  DO UPDATE SET joined_at = now(), is_active = true
  RETURNING * INTO v_join;

  RETURN v_join;
END;
$$;
