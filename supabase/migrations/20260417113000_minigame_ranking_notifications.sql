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
  v_old RECORD;
  v_team public.teams;
BEGIN
  IF NOT (
    public.has_role_text(auth.uid(), 'mini_game_holder')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_game
  FROM public.mini_games
  WHERE id = p_mini_game_id;

  IF NOT FOUND OR v_game.is_open = false THEN
    RAISE EXCEPTION 'Mini-game not available';
  END IF;

  IF v_game.holder_password_hash <> extensions.crypt(p_password, v_game.holder_password_hash) THEN
    RAISE EXCEPTION 'Invalid mini-game holder password';
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

  DELETE FROM public.mini_game_rankings WHERE mini_game_id = p_mini_game_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rankings)
  LOOP
    v_team_id := (v_item->>'team_id')::UUID;
    v_rank := (v_item->>'ranking')::INTEGER;

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

    SELECT * INTO v_team FROM public.teams WHERE id = v_team_id;
    IF FOUND THEN
      INSERT INTO public.notifications (user_id, team_id, type, title, message)
      VALUES (
        v_team.user_id,
        v_team.id,
        'announcement',
        'Mini-Game Result',
        format('In %s, your rank is #%s and you gained %s points.', v_game.name, v_rank, v_points)
      );
    END IF;
  END LOOP;
END;
$$;