-- Mini-Games Participant System
-- Adds individual user-based participation tracking for mini-games

-- 1. Create mini_game_participants table
CREATE TABLE IF NOT EXISTS public.mini_game_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_game_id UUID NOT NULL REFERENCES public.mini_games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_rank INTEGER NOT NULL DEFAULT 12 CHECK (current_rank > 0),
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mini_game_id, user_id)
);

ALTER TABLE public.mini_game_participants ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_mini_game_participants_updated_at ON public.mini_game_participants;
CREATE TRIGGER update_mini_game_participants_updated_at
BEFORE UPDATE ON public.mini_game_participants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RPC to check mini-game password
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

  -- Check if password matches (using crypt comparison)
  IF v_game.holder_password_hash = extensions.crypt(p_password, v_game.holder_password_hash) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 3. RPC to generate password hash
CREATE OR REPLACE FUNCTION public.crypt_generate(
  p_password TEXT
)
RETURNS TABLE(hashed_password TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT extensions.crypt(p_password, extensions.gen_salt('bf')) AS hashed_password;
END;
$$;

-- 4. RPC Policies for mini_game_participants
CREATE POLICY "Users can view their own participant records"
ON public.mini_game_participants FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own participant records"
ON public.mini_game_participants FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Mini-game holders can update participant records"
ON public.mini_game_participants FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.mini_games mg
    WHERE mg.id = mini_game_participants.mini_game_id
    AND (
      auth.uid() IN (
        SELECT user_id FROM public.user_roles
        WHERE role = 'mini_game_holder' OR role = 'admin'
      )
    )
  )
);

-- 5. Allow public read on mini_games when open (for participant list)
CREATE POLICY "Anyone can view open mini-games"
ON public.mini_games FOR SELECT
USING (is_open = true OR auth.uid() IN (
  SELECT user_id FROM public.user_roles
  WHERE role = 'admin' OR role = 'mini_game_holder'
));

-- 6. Allow admins to update mini-games
CREATE POLICY "Admins can manage mini-games"
ON public.mini_games FOR ALL
USING (auth.uid() IN (
  SELECT user_id FROM public.user_roles
  WHERE role = 'admin'
));

-- 7. Allow mini-game holders to view participants in their games
CREATE POLICY "Mini-game holders can view participants"
ON public.mini_game_participants FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.user_roles
    WHERE role = 'mini_game_holder' OR role = 'admin'
  )
);
