-- ============================================
-- Missions + Mini-Games + Health System Overhaul
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'mini_game_holder'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'mini_game_holder';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'mission_responsible'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'mission_responsible';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_role_text(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::TEXT = _role
  )
$$;

-- 2) Team health and suspension window
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS health_status NUMERIC(6,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teams_health_status_range'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_health_status_range CHECK (health_status >= 0 AND health_status <= 100);
  END IF;
END $$;

-- 3) Mini-games domain
CREATE TABLE IF NOT EXISTS public.mini_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_open BOOLEAN NOT NULL DEFAULT false,
  holder_password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mini_games ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_mini_games_updated_at ON public.mini_games;
CREATE TRIGGER update_mini_games_updated_at
BEFORE UPDATE ON public.mini_games
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mini_game_rank_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_game_id UUID NOT NULL REFERENCES public.mini_games(id) ON DELETE CASCADE,
  rank_position INTEGER NOT NULL CHECK (rank_position > 0),
  points_awarded INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mini_game_id, rank_position)
);
ALTER TABLE public.mini_game_rank_points ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.mini_game_joins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_game_id UUID NOT NULL REFERENCES public.mini_games(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (mini_game_id, team_id)
);
ALTER TABLE public.mini_game_joins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.mini_game_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_game_id UUID NOT NULL REFERENCES public.mini_games(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  ranking INTEGER NOT NULL CHECK (ranking > 0),
  points_awarded INTEGER NOT NULL DEFAULT 0,
  entered_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mini_game_id, team_id)
);
ALTER TABLE public.mini_game_rankings ENABLE ROW LEVEL SECURITY;

-- 4) Missions domain
CREATE TABLE IF NOT EXISTS public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_open BOOLEAN NOT NULL DEFAULT false,
  infection_rate_per_minute NUMERIC(8,3) NOT NULL DEFAULT 1,
  completion_password_hash TEXT NOT NULL,
  mandatory_card_id UUID REFERENCES public.cards(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_missions_updated_at ON public.missions;
CREATE TRIGGER update_missions_updated_at
BEFORE UPDATE ON public.missions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mission_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'outside' CHECK (status IN ('outside', 'pending_entry', 'inside', 'pending_exit', 'completed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_requested_at TIMESTAMPTZ,
  last_entered_at TIMESTAMPTZ,
  last_health_tick_at TIMESTAMPTZ,
  exit_requested_at TIMESTAMPTZ,
  total_inside_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, team_id)
);
ALTER TABLE public.mission_participations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_mission_participations_updated_at ON public.mission_participations;
CREATE TRIGGER update_mission_participations_updated_at
BEFORE UPDATE ON public.mission_participations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Platform settings for configurable gameplay values
INSERT INTO public.platform_settings (key, value)
VALUES
  ('health_base_decrease_rate_per_minute', to_jsonb(1)),
  ('suspension_duration_minutes', to_jsonb(10)),
  ('health_zero_penalty_points', to_jsonb(50))
ON CONFLICT (key) DO NOTHING;

-- 6) RLS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_games' AND policyname = 'Authenticated can read open mini games'
  ) THEN
    CREATE POLICY "Authenticated can read open mini games" ON public.mini_games
      FOR SELECT TO authenticated USING (is_open OR public.has_role(auth.uid(), 'admin') OR public.has_role_text(auth.uid(), 'mini_game_holder'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_games' AND policyname = 'Admins manage mini games'
  ) THEN
    CREATE POLICY "Admins manage mini games" ON public.mini_games
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_game_rank_points' AND policyname = 'Authenticated can read mini game rank points'
  ) THEN
    CREATE POLICY "Authenticated can read mini game rank points" ON public.mini_game_rank_points
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_game_rank_points' AND policyname = 'Admins manage mini game rank points'
  ) THEN
    CREATE POLICY "Admins manage mini game rank points" ON public.mini_game_rank_points
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_game_joins' AND policyname = 'Teams can read own mini game joins'
  ) THEN
    CREATE POLICY "Teams can read own mini game joins" ON public.mini_game_joins
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role_text(auth.uid(), 'mini_game_holder')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_game_joins' AND policyname = 'Teams can upsert own mini game joins'
  ) THEN
    CREATE POLICY "Teams can upsert own mini game joins" ON public.mini_game_joins
      FOR ALL TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_game_rankings' AND policyname = 'Authenticated can read mini game rankings'
  ) THEN
    CREATE POLICY "Authenticated can read mini game rankings" ON public.mini_game_rankings
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mini_game_rankings' AND policyname = 'Holders and admins manage rankings'
  ) THEN
    CREATE POLICY "Holders and admins manage rankings" ON public.mini_game_rankings
      FOR ALL TO authenticated USING (
        public.has_role_text(auth.uid(), 'mini_game_holder')
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'missions' AND policyname = 'Authenticated can read missions'
  ) THEN
    CREATE POLICY "Authenticated can read missions" ON public.missions
      FOR SELECT TO authenticated USING (is_open OR public.has_role(auth.uid(), 'admin') OR public.has_role_text(auth.uid(), 'mission_responsible'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'missions' AND policyname = 'Admins manage missions'
  ) THEN
    CREATE POLICY "Admins manage missions" ON public.missions
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_participations' AND policyname = 'Read mission participations by role'
  ) THEN
    CREATE POLICY "Read mission participations by role" ON public.mission_participations
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role_text(auth.uid(), 'mission_responsible')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_participations' AND policyname = 'Manage mission participations by role'
  ) THEN
    CREATE POLICY "Manage mission participations by role" ON public.mission_participations
      FOR ALL TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role_text(auth.uid(), 'mission_responsible')
      );
  END IF;
END $$;

-- 7) Helper functions
CREATE OR REPLACE FUNCTION public.get_setting_number(p_key TEXT, p_default NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value JSONB;
  v_num NUMERIC;
BEGIN
  SELECT value INTO v_value FROM public.platform_settings WHERE key = p_key;
  IF v_value IS NULL THEN
    RETURN p_default;
  END IF;

  BEGIN
    v_num := (v_value::TEXT)::NUMERIC;
    RETURN v_num;
  EXCEPTION WHEN others THEN
    BEGIN
      v_num := trim(both '"' from v_value::TEXT)::NUMERIC;
      RETURN v_num;
    EXCEPTION WHEN others THEN
      RETURN p_default;
    END;
  END;
END;
$$;

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
    AND is_suspended = true
    AND suspended_until IS NOT NULL
    AND suspended_until <= now();

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  RETURN v_team;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_health_penalty_and_suspend(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_penalty INTEGER := COALESCE(public.get_setting_number('health_zero_penalty_points', 50), 50)::INTEGER;
  v_suspend_minutes INTEGER := COALESCE(public.get_setting_number('suspension_duration_minutes', 10), 10)::INTEGER;
BEGIN
  UPDATE public.teams
  SET points = GREATEST(points - v_penalty, 0),
      is_suspended = true,
      suspended_until = now() + make_interval(mins => v_suspend_minutes),
      health_status = 0
  WHERE id = p_team_id;
END;
$$;

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
    WHERE status IN ('inside', 'pending_exit')
  LOOP
    PERFORM public.tick_health_for_participation(r.id);
  END LOOP;
END;
$$;

-- 8) Mini-game holder auth + ranking logic
CREATE OR REPLACE FUNCTION public.validate_minigame_holder_password(p_password TEXT)
RETURNS TABLE (mini_game_id UUID, game_name TEXT)
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
    AND mg.holder_password_hash = extensions.crypt(p_password, mg.holder_password_hash)
  ORDER BY mg.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid mini-game holder password';
  END IF;
END;
$$;

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
  END LOOP;
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

  INSERT INTO public.mini_game_joins (mini_game_id, team_id, joined_at, is_active)
  VALUES (p_mini_game_id, v_team.id, now(), true)
  ON CONFLICT (mini_game_id, team_id)
  DO UPDATE SET joined_at = now(), is_active = true
  RETURNING * INTO v_join;

  RETURN v_join;
END;
$$;

-- 9) Mission flow RPC
CREATE OR REPLACE FUNCTION public.join_mission(p_mission_id UUID)
RETURNS public.mission_participations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_mission public.missions;
  v_existing RECORD;
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
    RAISE EXCEPTION 'Team is suspended and cannot join missions';
  END IF;

  SELECT * INTO v_mission
  FROM public.missions
  WHERE id = p_mission_id;

  IF NOT FOUND OR v_mission.is_open = false THEN
    RAISE EXCEPTION 'Mission is not open';
  END IF;

  SELECT mp.id, mp.mission_id, mp.status
  INTO v_existing
  FROM public.mission_participations mp
  WHERE mp.team_id = v_team.id
    AND mp.mission_id <> p_mission_id
    AND mp.status IN ('outside', 'pending_entry', 'inside', 'pending_exit')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Team is already engaged in another mission';
  END IF;

  INSERT INTO public.mission_participations (mission_id, team_id, status, joined_at)
  VALUES (p_mission_id, v_team.id, 'outside', now())
  ON CONFLICT (mission_id, team_id)
  DO UPDATE SET status = CASE
      WHEN public.mission_participations.status = 'completed' THEN public.mission_participations.status
      ELSE 'outside'
    END,
    joined_at = now(),
    entry_requested_at = NULL,
    exit_requested_at = NULL,
    last_health_tick_at = CASE
      WHEN public.mission_participations.status = 'completed' THEN public.mission_participations.last_health_tick_at
      ELSE NULL
    END
  RETURNING * INTO v_part;

  RETURN v_part;
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
      last_health_tick_at = COALESCE(last_health_tick_at, now())
  WHERE id = v_part.id
  RETURNING * INTO v_part;

  RETURN v_part;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_mission_exit(p_mission_id UUID)
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

  SELECT * INTO v_part
  FROM public.mission_participations
  WHERE mission_id = p_mission_id
    AND team_id = v_team.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission participation not found';
  END IF;

  IF v_part.status <> 'inside' THEN
    RAISE EXCEPTION 'You must be inside zone to request exit';
  END IF;

  PERFORM public.tick_health_for_participation(v_part.id);

  UPDATE public.mission_participations
  SET status = 'pending_exit',
      exit_requested_at = now()
  WHERE id = v_part.id
  RETURNING * INTO v_part;

  RETURN v_part;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_mission_transition(p_participation_id UUID, p_action TEXT)
RETURNS public.mission_participations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part public.mission_participations;
  v_now TIMESTAMPTZ := now();
  v_add_seconds INTEGER;
BEGIN
  IF NOT (
    public.has_role_text(auth.uid(), 'mission_responsible')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_part
  FROM public.mission_participations
  WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found';
  END IF;

  IF p_action = 'approve_entry' THEN
    IF v_part.status <> 'pending_entry' THEN
      RAISE EXCEPTION 'Entry is not pending';
    END IF;

    UPDATE public.mission_participations
    SET status = 'inside',
        last_entered_at = COALESCE(v_part.entry_requested_at, v_now),
        last_health_tick_at = COALESCE(v_part.entry_requested_at, v_now),
        exit_requested_at = NULL
    WHERE id = v_part.id
    RETURNING * INTO v_part;

    RETURN v_part;
  ELSIF p_action = 'approve_exit' THEN
    IF v_part.status <> 'pending_exit' THEN
      RAISE EXCEPTION 'Exit is not pending';
    END IF;

    PERFORM public.tick_health_for_participation(v_part.id);

    v_add_seconds := COALESCE(EXTRACT(EPOCH FROM (v_now - COALESCE(v_part.last_entered_at, v_now)))::INTEGER, 0);

    UPDATE public.mission_participations
    SET status = 'outside',
        total_inside_seconds = total_inside_seconds + GREATEST(v_add_seconds, 0),
        exit_requested_at = NULL,
        entry_requested_at = NULL,
        last_entered_at = NULL,
        last_health_tick_at = NULL
    WHERE id = v_part.id
    RETURNING * INTO v_part;

    RETURN v_part;
  ELSE
    RAISE EXCEPTION 'Unknown action. Use approve_entry or approve_exit';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mission_with_password(p_mission_id UUID, p_password TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_mission public.missions;
  v_part public.mission_participations;
  v_tier_id UUID;
  v_coffre_id UUID;
  v_random_card UUID;
  i INTEGER;
BEGIN
  SELECT * INTO v_team
  FROM public.teams
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant team not found';
  END IF;

  SELECT * INTO v_team FROM public.refresh_team_suspension_state(v_team.id);

  IF v_team.is_suspended THEN
    RAISE EXCEPTION 'Team is suspended and cannot complete missions';
  END IF;

  SELECT * INTO v_mission
  FROM public.missions
  WHERE id = p_mission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found';
  END IF;

  IF v_mission.completion_password_hash <> extensions.crypt(p_password, v_mission.completion_password_hash) THEN
    RAISE EXCEPTION 'Invalid mission password';
  END IF;

  SELECT * INTO v_part
  FROM public.mission_participations
  WHERE mission_id = p_mission_id
    AND team_id = v_team.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join mission before completion';
  END IF;

  IF v_part.status = 'completed' THEN
    RAISE EXCEPTION 'Mission already completed';
  END IF;

  SELECT id INTO v_tier_id
  FROM public.coffre_tiers
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.coffres (team_id, tier_id, coffre_type, source_label)
  VALUES (v_team.id, v_tier_id, 'game_reward', v_mission.name)
  RETURNING id INTO v_coffre_id;

  IF v_mission.mandatory_card_id IS NOT NULL THEN
    INSERT INTO public.coffre_cards (coffre_id, card_id)
    VALUES (v_coffre_id, v_mission.mandatory_card_id);
  END IF;

  FOR i IN 1..2 LOOP
    SELECT c.id INTO v_random_card
    FROM public.cards c
    WHERE c.is_mandatory = false
    ORDER BY random()
    LIMIT 1;

    IF v_random_card IS NOT NULL THEN
      INSERT INTO public.coffre_cards (coffre_id, card_id)
      VALUES (v_coffre_id, v_random_card);
    END IF;
  END LOOP;

  UPDATE public.mission_participations
  SET status = 'completed',
      completed_at = now(),
      entry_requested_at = NULL,
      exit_requested_at = NULL,
      last_entered_at = NULL,
      last_health_tick_at = NULL
  WHERE id = v_part.id;

  INSERT INTO public.notifications (user_id, team_id, type, title, message)
  VALUES (
    auth.uid(),
    v_team.id,
    'coffre_awarded',
    'Mission Completed',
    'Mission completion confirmed. Your coffre is ready to open.'
  );

  RETURN v_coffre_id;
END;
$$;

-- Admin password hashing updaters (sensitive logic backend only)
CREATE OR REPLACE FUNCTION public.admin_set_mission_password(p_mission_id UUID, p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.missions
  SET completion_password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  WHERE id = p_mission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_minigame_password(p_mini_game_id UUID, p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.mini_games
  SET holder_password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  WHERE id = p_mini_game_id;
END;
$$;

-- 10) Remove trading/selling at backend (buy only)
CREATE OR REPLACE FUNCTION public.reject_non_buy_trade_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.request_type::TEXT <> 'buy' THEN
    RAISE EXCEPTION 'Only buy requests are allowed in this platform version';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_non_buy_trade_requests ON public.trade_requests;
CREATE TRIGGER trg_reject_non_buy_trade_requests
BEFORE INSERT OR UPDATE ON public.trade_requests
FOR EACH ROW EXECUTE FUNCTION public.reject_non_buy_trade_requests();

-- 11) Seed sample missions / mini-games if absent
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.missions;
  IF v_count = 0 THEN
    INSERT INTO public.missions (name, is_open, infection_rate_per_minute, completion_password_hash)
    VALUES
      ('Mission #1', false, 1, extensions.crypt('mission1', extensions.gen_salt('bf'))),
      ('Mission #2', false, 1, extensions.crypt('mission2', extensions.gen_salt('bf'))),
      ('Mission #3', false, 1, extensions.crypt('mission3', extensions.gen_salt('bf'))),
      ('Mission #4', false, 1, extensions.crypt('mission4', extensions.gen_salt('bf'))),
      ('Mission #5', false, 1, extensions.crypt('mission5', extensions.gen_salt('bf'))),
      ('Mission #6', false, 1, extensions.crypt('mission6', extensions.gen_salt('bf')));
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.mini_games;
  IF v_count = 0 THEN
    INSERT INTO public.mini_games (name, is_open, holder_password_hash)
    VALUES
      ('Mini Game #1', false, extensions.crypt('mini1', extensions.gen_salt('bf'))),
      ('Mini Game #2', false, extensions.crypt('mini2', extensions.gen_salt('bf')));
  END IF;
END $$;
