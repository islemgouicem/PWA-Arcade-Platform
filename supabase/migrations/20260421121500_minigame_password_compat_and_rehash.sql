-- Fix legacy mini-game passwords that may have been stored as plaintext.
-- 1) Re-hash non-bcrypt values in mini_games.holder_password_hash.
-- 2) Make password checks tolerant of legacy values.

UPDATE public.mini_games
SET holder_password_hash = extensions.crypt(holder_password_hash, extensions.gen_salt('bf'))
WHERE holder_password_hash IS NOT NULL
  AND holder_password_hash NOT LIKE '$2%';

CREATE OR REPLACE FUNCTION public.check_mini_game_password(
  p_game_id UUID,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.mini_games;
BEGIN
  SELECT * INTO v_game
  FROM public.mini_games
  WHERE id = p_game_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_game.holder_password_hash IS NULL THEN
    RETURN false;
  END IF;

  -- bcrypt hash path
  IF v_game.holder_password_hash LIKE '$2%' THEN
    RETURN v_game.holder_password_hash = extensions.crypt(p_password, v_game.holder_password_hash);
  END IF;

  -- legacy plaintext fallback
  RETURN v_game.holder_password_hash = p_password;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_minigame_holder_password(p_password TEXT)
RETURNS TABLE(mini_game_id UUID, game_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role_text(auth.uid(), 'mini_game_holder')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT mg.id, mg.name
  FROM public.mini_games mg
  WHERE mg.is_open = true
    AND (
      (mg.holder_password_hash LIKE '$2%' AND mg.holder_password_hash = extensions.crypt(p_password, mg.holder_password_hash))
      OR (mg.holder_password_hash NOT LIKE '$2%' AND mg.holder_password_hash = p_password)
    )
  LIMIT 1;
END;
$$;
