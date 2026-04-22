-- ============================================
-- Advanced Missions System Refactor
-- ============================================
-- Supports:
-- 1. Zone-based missions with multiple zones
-- 2. Flexible password system (entry/finish, team-specific)
-- 3. FIFO reward distribution
-- 4. Mission progression with visibility/enabled controls
-- 5. Special mission types (5&6, final submission)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1) EXTEND MISSIONS TABLE WITH NEW FIELDS
-- ============================================

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'standard' CHECK (mission_type IN ('standard', 'multi_zone', 'special', 'final_submission')),
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS require_entry_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_finish_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS finish_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_final_submission BOOLEAN NOT NULL DEFAULT false;

-- Drop old completion_password_hash if not already used elsewhere
-- We'll migrate completion_password_hash to finish_password_hash in legacy data

UPDATE public.missions
SET finish_password_hash = completion_password_hash,
    require_finish_password = true
WHERE finish_password_hash IS NULL AND completion_password_hash IS NOT NULL;

-- ============================================
-- 2) MISSION ZONES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.mission_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'standard',
  infection_rate NUMERIC(8,3) NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  sequence_in_mission INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, name),
  CHECK (sequence_in_mission > 0)
);
ALTER TABLE public.mission_zones ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_mission_zones_updated_at ON public.mission_zones;
CREATE TRIGGER update_mission_zones_updated_at
BEFORE UPDATE ON public.mission_zones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3) ZONE ENTRY REQUESTS & STATUS
-- ============================================

CREATE TABLE IF NOT EXISTS public.zone_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.mission_zones(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'inside', 'exit_requested', 'exited')),
  entry_requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_entered_at TIMESTAMPTZ,
  last_health_tick_at TIMESTAMPTZ,
  exit_requested_at TIMESTAMPTZ,
  exited_at TIMESTAMPTZ,
  total_inside_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (zone_id, team_id)
);
ALTER TABLE public.zone_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_zone_entries_updated_at ON public.zone_entries;
CREATE TRIGGER update_zone_entries_updated_at
BEFORE UPDATE ON public.zone_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4) TEAM-SPECIFIC MISSION PASSWORDS
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_mission_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  entry_password_hash TEXT,
  finish_password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, mission_id)
);
ALTER TABLE public.team_mission_passwords ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_team_mission_passwords_updated_at ON public.team_mission_passwords;
CREATE TRIGGER update_team_mission_passwords_updated_at
BEFORE UPDATE ON public.team_mission_passwords
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 5) MISSION COMPLETION TRACKING (FIFO)
-- ============================================

CREATE TABLE IF NOT EXISTS public.mission_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  completion_position INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, team_id),
  UNIQUE (mission_id, completion_position)
);
ALTER TABLE public.mission_completions ENABLE ROW LEVEL SECURITY;

-- Index for ordering completions
CREATE INDEX IF NOT EXISTS idx_mission_completions_position
ON public.mission_completions (mission_id, completion_position);

-- ============================================
-- 6) MISSION REWARDS (FIFO SYSTEM)
-- ============================================

CREATE TABLE IF NOT EXISTS public.mission_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE RESTRICT,
  completion_position INTEGER NOT NULL,
  distributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, team_id, card_id),
  CHECK (completion_position > 0)
);
ALTER TABLE public.mission_rewards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mission_rewards_by_team_mission
ON public.mission_rewards (team_id, mission_id);

-- ============================================
-- 7. MISSION SUBMISSION (FINAL MISSION)
-- ============================================

CREATE TABLE IF NOT EXISTS public.mission_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  document_path TEXT NOT NULL,
  document_name TEXT NOT NULL,
  submission_data JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, team_id)
);
ALTER TABLE public.mission_submissions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8) MISSION PROGRESSION PER TEAM
-- ============================================

CREATE TABLE IF NOT EXISTS public.team_mission_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, mission_id)
);
ALTER TABLE public.team_mission_progression ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_team_mission_progression_updated_at ON public.team_mission_progression;
CREATE TRIGGER update_team_mission_progression_updated_at
BEFORE UPDATE ON public.team_mission_progression
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast current mission lookup
CREATE INDEX IF NOT EXISTS idx_team_mission_progression_current
ON public.team_mission_progression (team_id, is_current) WHERE is_current = true;

-- ============================================
-- 9) RLS POLICIES FOR MISSION_ZONES
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_zones' AND policyname = 'Admins manage mission zones'
  ) THEN
    CREATE POLICY "Admins manage mission zones" ON public.mission_zones
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_zones' AND policyname = 'Mission handlers read zones'
  ) THEN
    CREATE POLICY "Mission handlers read zones" ON public.mission_zones
      FOR SELECT TO authenticated USING (
        public.has_role_text(auth.uid(), 'mission_responsible')
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- ============================================
-- 10) RLS POLICIES FOR ZONE_ENTRIES
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'zone_entries' AND policyname = 'Teams read own zone entries'
  ) THEN
    CREATE POLICY "Teams read own zone entries" ON public.zone_entries
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role_text(auth.uid(), 'mission_responsible')
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'zone_entries' AND policyname = 'Teams manage own zone entries'
  ) THEN
    CREATE POLICY "Teams manage own zone entries" ON public.zone_entries
      FOR ALL TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'zone_entries' AND policyname = 'Handlers manage zone entries'
  ) THEN
    CREATE POLICY "Handlers manage zone entries" ON public.zone_entries
      FOR ALL TO authenticated USING (
        public.has_role_text(auth.uid(), 'mission_responsible')
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- ============================================
-- 11) RLS POLICIES FOR TEAM_MISSION_PASSWORDS
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_mission_passwords' AND policyname = 'Teams read own passwords'
  ) THEN
    CREATE POLICY "Teams read own passwords" ON public.team_mission_passwords
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_mission_passwords' AND policyname = 'Admins manage team passwords'
  ) THEN
    CREATE POLICY "Admins manage team passwords" ON public.team_mission_passwords
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ============================================
-- 12) RLS POLICIES FOR MISSION_COMPLETIONS
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_completions' AND policyname = 'Read mission completions'
  ) THEN
    CREATE POLICY "Read mission completions" ON public.mission_completions
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role_text(auth.uid(), 'mission_responsible')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_completions' AND policyname = 'Admins manage completions'
  ) THEN
    CREATE POLICY "Admins manage completions" ON public.mission_completions
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ============================================
-- 13) RLS POLICIES FOR MISSION_REWARDS
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_rewards' AND policyname = 'Teams read own rewards'
  ) THEN
    CREATE POLICY "Teams read own rewards" ON public.mission_rewards
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_rewards' AND policyname = 'System distributes rewards'
  ) THEN
    CREATE POLICY "System distributes rewards" ON public.mission_rewards
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ============================================
-- 14) RLS POLICIES FOR MISSION_SUBMISSIONS
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_submissions' AND policyname = 'Teams read own submissions'
  ) THEN
    CREATE POLICY "Teams read own submissions" ON public.mission_submissions
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_submissions' AND policyname = 'Teams submit own documents'
  ) THEN
    CREATE POLICY "Teams submit own documents" ON public.mission_submissions
      FOR INSERT TO authenticated WITH CHECK (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_submissions' AND policyname = 'Admins manage submissions'
  ) THEN
    CREATE POLICY "Admins manage submissions" ON public.mission_submissions
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ============================================
-- 15) RLS POLICIES FOR TEAM_MISSION_PROGRESSION
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_mission_progression' AND policyname = 'Teams read own progression'
  ) THEN
    CREATE POLICY "Teams read own progression" ON public.team_mission_progression
      FOR SELECT TO authenticated USING (
        team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'team_mission_progression' AND policyname = 'Admins update progression'
  ) THEN
    CREATE POLICY "Admins update progression" ON public.team_mission_progression
      FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ============================================
-- 16) BACKEND FUNCTIONS - ZONE MANAGEMENT
-- ============================================

CREATE OR REPLACE FUNCTION public.team_request_zone_entry(
  p_zone_id UUID,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_zone public.mission_zones;
  v_entry public.zone_entries;
BEGIN
  -- Get team from current user
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  -- Get and validate zone
  SELECT * INTO v_zone
  FROM public.mission_zones
  WHERE id = p_zone_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Zone not found');
  END IF;

  -- Validate password
  IF v_zone.password_hash <> extensions.crypt(p_password, v_zone.password_hash) THEN
    RETURN jsonb_build_object('error', 'Invalid zone password');
  END IF;

  -- Check if team already has an entry for this zone
  SELECT * INTO v_entry
  FROM public.zone_entries
  WHERE zone_id = p_zone_id AND team_id = v_team_id;

  IF FOUND THEN
    -- Update existing entry
    UPDATE public.zone_entries
    SET status = 'pending',
        entry_requested_at = now()
    WHERE zone_id = p_zone_id AND team_id = v_team_id;
  ELSE
    -- Create new entry request
    INSERT INTO public.zone_entries (zone_id, team_id, status)
    VALUES (p_zone_id, v_team_id, 'pending');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Zone entry requested'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handler_approve_zone_entry(
  p_zone_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.zone_entries;
BEGIN
  -- Authorization check
  IF NOT (
    public.has_role_text(auth.uid(), 'mission_responsible')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_entry
  FROM public.zone_entries
  WHERE id = p_zone_entry_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  UPDATE public.zone_entries
  SET status = 'inside',
      last_entered_at = now(),
      last_health_tick_at = now()
  WHERE id = p_zone_entry_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Team entry approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handler_deny_zone_entry(
  p_zone_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.zone_entries;
BEGIN
  -- Authorization check
  IF NOT (
    public.has_role_text(auth.uid(), 'mission_responsible')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_entry
  FROM public.zone_entries
  WHERE id = p_zone_entry_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  DELETE FROM public.zone_entries
  WHERE id = p_zone_entry_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Team entry denied'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.team_request_zone_exit(
  p_zone_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.zone_entries;
  v_team_id UUID;
BEGIN
  -- Get team
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid()
  LIMIT 1;

  SELECT * INTO v_entry
  FROM public.zone_entries
  WHERE id = p_zone_entry_id;

  IF NOT FOUND OR v_entry.team_id <> v_team_id THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  UPDATE public.zone_entries
  SET status = 'exit_requested',
      exit_requested_at = now()
  WHERE id = p_zone_entry_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Exit requested'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handler_approve_zone_exit(
  p_zone_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.zone_entries;
  v_elapsed_seconds NUMERIC;
BEGIN
  -- Authorization check
  IF NOT (
    public.has_role_text(auth.uid(), 'mission_responsible')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_entry
  FROM public.zone_entries
  WHERE id = p_zone_entry_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  -- Calculate time spent
  v_elapsed_seconds := COALESCE(
    EXTRACT(EPOCH FROM (now() - v_entry.last_entered_at))::INTEGER,
    0
  );

  UPDATE public.zone_entries
  SET status = 'exited',
      exited_at = now(),
      total_inside_seconds = total_inside_seconds + v_elapsed_seconds
  WHERE id = p_zone_entry_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Team exit approved',
    'time_inside_seconds', v_elapsed_seconds
  );
END;
$$;

-- ============================================
-- 17) BACKEND FUNCTIONS - MISSION COMPLETION
-- ============================================

CREATE OR REPLACE FUNCTION public.complete_mission(
  p_mission_id UUID,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_mission public.missions;
  v_position INTEGER;
BEGIN
  -- Get team
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  -- Get mission
  SELECT * INTO v_mission
  FROM public.missions
  WHERE id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Mission not found');
  END IF;

  -- Check if team already completed
  IF EXISTS (
    SELECT 1 FROM public.mission_completions
    WHERE mission_id = p_mission_id AND team_id = v_team_id
  ) THEN
    RETURN jsonb_build_object('error', 'Mission already completed');
  END IF;

  -- Validate finish password if required
  IF v_mission.require_finish_password THEN
    -- Check team-specific password first
    IF EXISTS (
      SELECT 1 FROM public.team_mission_passwords
      WHERE mission_id = p_mission_id AND team_id = v_team_id
        AND finish_password_hash = extensions.crypt(p_password, finish_password_hash)
    ) THEN
      NULL; -- Valid
    -- Otherwise check mission-wide password
    ELSIF v_mission.finish_password_hash <> extensions.crypt(p_password, v_mission.finish_password_hash) THEN
      RETURN jsonb_build_object('error', 'Invalid finish password');
    END IF;
  END IF;

  -- Get next completion position
  SELECT COALESCE(MAX(completion_position), 0) + 1 INTO v_position
  FROM public.mission_completions
  WHERE mission_id = p_mission_id;

  -- Record completion with position
  INSERT INTO public.mission_completions (mission_id, team_id, completion_position)
  VALUES (p_mission_id, v_team_id, v_position);

  -- Update mission participation
  UPDATE public.mission_participations
  SET status = 'completed', completed_at = now()
  WHERE mission_id = p_mission_id AND team_id = v_team_id;

  -- Mark current progression as completed
  UPDATE public.team_mission_progression
  SET status = 'completed', completed_at = now(), is_current = false
  WHERE mission_id = p_mission_id AND team_id = v_team_id;

  -- Unlock next mission
  PERFORM public.unlock_next_mission_for_team(v_team_id);

  -- Distribute rewards based on position
  PERFORM public.distribute_mission_rewards(p_mission_id, v_team_id, v_position);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Mission completed',
    'completion_position', v_position
  );
END;
$$;

-- ============================================
-- 18) BACKEND FUNCTIONS - MISSION PROGRESSION
-- ============================================

CREATE OR REPLACE FUNCTION public.unlock_next_mission_for_team(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_seq INTEGER;
  v_next_mission public.missions;
BEGIN
  -- Get current mission sequence
  SELECT COALESCE(m.sequence_number, 0)
    INTO v_current_seq
  FROM public.team_mission_progression tmp
  JOIN public.missions m ON m.id = tmp.mission_id
  WHERE tmp.team_id = p_team_id AND tmp.is_current = true
  LIMIT 1;

  -- Find next sequential mission
  SELECT m.*
    INTO v_next_mission
  FROM public.missions m
  WHERE m.sequence_number = v_current_seq + 1
    AND m.enabled = true
  LIMIT 1;

  IF FOUND THEN
    -- Check if progression record exists
    IF NOT EXISTS (
      SELECT 1 FROM public.team_mission_progression
      WHERE team_id = p_team_id AND mission_id = v_next_mission.id
    ) THEN
      INSERT INTO public.team_mission_progression (
        team_id, mission_id, is_current, status
      ) VALUES (
        p_team_id, v_next_mission.id, true, 'available'
      );
    ELSE
      UPDATE public.team_mission_progression
      SET is_current = true, status = 'available'
      WHERE team_id = p_team_id AND mission_id = v_next_mission.id;
    END IF;
  END IF;
END;
$$;

-- ============================================
-- 19) BACKEND FUNCTIONS - REWARD DISTRIBUTION
-- ============================================

CREATE OR REPLACE FUNCTION public.distribute_mission_rewards(
  p_mission_id UUID,
  p_team_id UUID,
  p_completion_position INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_count INTEGER;
  v_reward_cards UUID[];
  v_reward_card UUID;
  i INTEGER;
BEGIN
  -- Determine how many cards based on position
  v_card_count := CASE
    WHEN p_completion_position = 1 THEN 3
    WHEN p_completion_position = 2 THEN 2
    ELSE 1
  END;

  -- Get random shop cards
  SELECT ARRAY_AGG(id)
    INTO v_reward_cards
  FROM (
    SELECT id
    FROM public.cards
    WHERE shop_visible = true AND shop_enabled = true
      AND card_type IN ('hint_single', 'recovery', 'manipulation', 'protection')
    ORDER BY RANDOM()
    LIMIT v_card_count
  ) sub;

  -- Insert rewards
  FOR i IN 1 .. ARRAY_LENGTH(v_reward_cards, 1) LOOP
    v_reward_card := v_reward_cards[i];
    INSERT INTO public.mission_rewards (
      mission_id, team_id, card_id, completion_position
    ) VALUES (
      p_mission_id, p_team_id, v_reward_card, p_completion_position
    );
  END LOOP;
END;
$$;

-- ============================================
-- 20) BACKEND FUNCTIONS - FINAL SUBMISSION
-- ============================================

CREATE OR REPLACE FUNCTION public.can_access_final_mission(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if all non-final missions are completed
  RETURN NOT EXISTS (
    SELECT 1 FROM public.missions m
    WHERE m.is_final_submission = false
      AND NOT EXISTS (
        SELECT 1 FROM public.mission_completions mc
        WHERE mc.mission_id = m.id AND mc.team_id = p_team_id
      )
  );
END;
$$;

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
BEGIN
  -- Get team
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  -- Get mission
  SELECT * INTO v_mission
  FROM public.missions
  WHERE id = p_mission_id AND is_final_submission = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Final mission not found');
  END IF;

  -- Check access
  IF NOT public.can_access_final_mission(v_team_id) THEN
    RETURN jsonb_build_object('error', 'Not all prerequisites completed');
  END IF;

  -- Check for existing submission
  IF EXISTS (
    SELECT 1 FROM public.mission_submissions
    WHERE mission_id = p_mission_id AND team_id = v_team_id
  ) THEN
    RETURN jsonb_build_object('error', 'Submission already exists. Please contact admin to resubmit.');
  END IF;

  -- Insert submission
  INSERT INTO public.mission_submissions (
    mission_id, team_id, document_path, document_name, submission_data
  ) VALUES (
    p_mission_id, v_team_id, p_document_path, p_document_name, p_submission_data
  );

  -- Record completion
  INSERT INTO public.mission_completions (
    mission_id, team_id, completion_position
  ) VALUES (
    p_mission_id, v_team_id, 1
  )
  ON CONFLICT (mission_id, team_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Final submission received'
  );
END;
$$;

-- ============================================
-- 21) BACKEND FUNCTIONS - PASSWORD MANAGEMENT
-- ============================================

CREATE OR REPLACE FUNCTION public.set_team_mission_password(
  p_team_id UUID,
  p_mission_id UUID,
  p_entry_password TEXT,
  p_finish_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin only
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  INSERT INTO public.team_mission_passwords (
    team_id, mission_id,
    entry_password_hash,
    finish_password_hash
  ) VALUES (
    p_team_id, p_mission_id,
    CASE WHEN p_entry_password IS NOT NULL
      THEN extensions.crypt(p_entry_password, extensions.gen_salt('bf'))
      ELSE NULL
    END,
    CASE WHEN p_finish_password IS NOT NULL
      THEN extensions.crypt(p_finish_password, extensions.gen_salt('bf'))
      ELSE NULL
    END
  )
  ON CONFLICT (team_id, mission_id) DO UPDATE SET
    entry_password_hash = CASE WHEN p_entry_password IS NOT NULL
      THEN extensions.crypt(p_entry_password, extensions.gen_salt('bf'))
      ELSE EXCLUDED.entry_password_hash
    END,
    finish_password_hash = CASE WHEN p_finish_password IS NOT NULL
      THEN extensions.crypt(p_finish_password, extensions.gen_salt('bf'))
      ELSE EXCLUDED.finish_password_hash
    END;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- 22) UPDATED MISSIONS RLS INCLUDE NEW FIELDS
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'missions' AND policyname = 'Authenticated can read visible missions'
  ) THEN
    DROP POLICY IF EXISTS "Authenticated can read missions" ON public.missions;
    CREATE POLICY "Authenticated can read visible missions" ON public.missions
      FOR SELECT TO authenticated USING (
        (visible = true AND enabled = true)
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role_text(auth.uid(), 'mission_responsible')
      );
  END IF;
END $$;

-- ============================================
-- 23) ADD MISSION HANDLER ROLE IF NOT EXISTS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'zone_handler'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'zone_handler';
  END IF;
END $$;

-- ============================================
-- 24) INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_mission_zones_mission_id ON public.mission_zones(mission_id);
CREATE INDEX IF NOT EXISTS idx_zone_entries_zone_id ON public.zone_entries(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_entries_team_id ON public.zone_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_zone_entries_status ON public.zone_entries(status);
CREATE INDEX IF NOT EXISTS idx_team_mission_passwords_team_mission ON public.team_mission_passwords(team_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_completions_mission_id ON public.mission_completions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_completions_team_id ON public.mission_completions(team_id);
CREATE INDEX IF NOT EXISTS idx_mission_rewards_team_id ON public.mission_rewards(team_id);
CREATE INDEX IF NOT EXISTS idx_mission_submissions_team_mission ON public.mission_submissions(team_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_team_mission_progression_team_id ON public.team_mission_progression(team_id);

-- ============================================
-- 25) COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✓ Advanced Missions System deployed successfully';
END $$;
