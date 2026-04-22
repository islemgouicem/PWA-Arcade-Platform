-- Static Missions Backend (Mission 1..6 only)
-- Enforces explicit mission progression and backend-side password validation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mission2_group_passwords (
  group_number INTEGER PRIMARY KEY CHECK (group_number > 0),
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mission_static_resources (
  mission_number INTEGER PRIMARY KEY CHECK (mission_number IN (4, 5)),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('text', 'link')),
  resource_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_mission_static_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  mission_number INTEGER NOT NULL CHECK (mission_number IN (4, 5)),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('text', 'link')),
  resource_value TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, mission_number)
);

ALTER TABLE public.mission2_group_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_static_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_mission_static_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage mission2 group passwords" ON public.mission2_group_passwords;
CREATE POLICY "Admins manage mission2 group passwords" ON public.mission2_group_passwords
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage mission static resources" ON public.mission_static_resources;
CREATE POLICY "Admins manage mission static resources" ON public.mission_static_resources
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Read team mission static resources" ON public.team_mission_static_resources;
CREATE POLICY "Read team mission static resources" ON public.team_mission_static_resources
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR team_id IN (
    SELECT t.id
    FROM public.teams t
    WHERE t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "System can write team mission static resources" ON public.team_mission_static_resources;
CREATE POLICY "System can write team mission static resources" ON public.team_mission_static_resources
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ensure six static missions exist with fixed sequence numbers.
DO $$
DECLARE
  i INTEGER;
  m_name TEXT;
  m_type TEXT;
  v_sequence_id UUID;
  v_named_id UUID;
BEGIN
  FOR i IN 1..6 LOOP
    m_name := CASE i
      WHEN 1 THEN 'Mission 1'
      WHEN 2 THEN 'Mission 2'
      WHEN 3 THEN 'Mission 3'
      WHEN 4 THEN 'Mission 4'
      WHEN 5 THEN 'Mission 5'
      ELSE 'Mission 6'
    END;

    m_type := CASE i
      WHEN 6 THEN 'final_submission'
      WHEN 1 THEN 'multi_zone'
      WHEN 2 THEN 'multi_zone'
      ELSE 'standard'
    END;

    SELECT id INTO v_sequence_id
    FROM public.missions
    WHERE sequence_number = i
    LIMIT 1;

    SELECT id INTO v_named_id
    FROM public.missions
    WHERE name = m_name
    LIMIT 1;

    IF v_sequence_id IS NOT NULL AND v_named_id IS NOT NULL AND v_sequence_id <> v_named_id THEN
      UPDATE public.missions
      SET name = m_name || ' (legacy duplicate ' || i || ')'
      WHERE id = v_named_id;

      UPDATE public.missions
      SET sequence_number = i,
          name = m_name,
          mission_type = m_type,
          is_final_submission = (i = 6),
          visible = CASE WHEN i = 1 THEN true ELSE visible END,
          enabled = CASE WHEN i = 1 THEN true ELSE enabled END,
          is_open = CASE WHEN i = 1 THEN true ELSE is_open END
      WHERE id = v_sequence_id;
    ELSIF v_sequence_id IS NOT NULL THEN
      UPDATE public.missions
      SET sequence_number = i,
          name = m_name,
          mission_type = m_type,
          is_final_submission = (i = 6),
          visible = CASE WHEN i = 1 THEN true ELSE visible END,
          enabled = CASE WHEN i = 1 THEN true ELSE enabled END,
          is_open = CASE WHEN i = 1 THEN true ELSE is_open END
      WHERE id = v_sequence_id;
    ELSIF v_named_id IS NOT NULL THEN
      UPDATE public.missions
      SET sequence_number = i,
          name = m_name,
          mission_type = m_type,
          is_final_submission = (i = 6),
          visible = CASE WHEN i = 1 THEN true ELSE visible END,
          enabled = CASE WHEN i = 1 THEN true ELSE enabled END,
          is_open = CASE WHEN i = 1 THEN true ELSE is_open END
      WHERE id = v_named_id;
    ELSE
      INSERT INTO public.missions (
        name,
        sequence_number,
        mission_type,
        visible,
        enabled,
        is_open,
        is_final_submission,
        completion_password_hash,
        finish_password_hash,
        require_finish_password
      )
      VALUES (
        m_name,
        i,
        m_type,
        (i = 1),
        (i = 1),
        (i = 1),
        (i = 6),
        extensions.crypt('CHANGE_ME', extensions.gen_salt('bf')),
        extensions.crypt('CHANGE_ME', extensions.gen_salt('bf')),
        true
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.static_mission_id(p_mission_number INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission_id UUID;
BEGIN
  SELECT id INTO v_mission_id
  FROM public.missions
  WHERE sequence_number = p_mission_number
  LIMIT 1;

  IF v_mission_id IS NULL THEN
    RAISE EXCEPTION 'Static mission % is missing', p_mission_number;
  END IF;

  RETURN v_mission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.static_team_group_number(p_team_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      t.id,
      ROW_NUMBER() OVER (ORDER BY t.created_at, t.id) AS team_rank
    FROM public.teams t
  )
  SELECT ((r.team_rank - 1) / 6) + 1
  FROM ranked r
  WHERE r.id = p_team_id
$$;

CREATE OR REPLACE FUNCTION public.is_static_mission_unlocked(p_team_id UUID, p_mission_number INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m1 UUID := public.static_mission_id(1);
  m2 UUID := public.static_mission_id(2);
  m3 UUID := public.static_mission_id(3);
  m4 UUID := public.static_mission_id(4);
  m5 UUID := public.static_mission_id(5);
  c1 BOOLEAN;
  c2 BOOLEAN;
  c3 BOOLEAN;
  c4 BOOLEAN;
  c5 BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.mission_participations
    WHERE team_id = p_team_id AND mission_id = m1 AND status = 'completed'
  ) INTO c1;

  SELECT EXISTS(
    SELECT 1 FROM public.mission_participations
    WHERE team_id = p_team_id AND mission_id = m2 AND status = 'completed'
  ) INTO c2;

  SELECT EXISTS(
    SELECT 1 FROM public.mission_participations
    WHERE team_id = p_team_id AND mission_id = m3 AND status = 'completed'
  ) INTO c3;

  SELECT EXISTS(
    SELECT 1 FROM public.mission_participations
    WHERE team_id = p_team_id AND mission_id = m4 AND status = 'completed'
  ) INTO c4;

  SELECT EXISTS(
    SELECT 1 FROM public.mission_participations
    WHERE team_id = p_team_id AND mission_id = m5 AND status = 'completed'
  ) INTO c5;

  RETURN CASE p_mission_number
    WHEN 1 THEN true
    WHEN 2 THEN c1
    WHEN 3 THEN c2
    WHEN 4 THEN c3
    WHEN 5 THEN c3
    WHEN 6 THEN c1 AND c2 AND c3 AND c4 AND c5
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_static_mission(p_mission_number INTEGER)
RETURNS public.mission_participations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_mission public.missions;
  v_part public.mission_participations;
BEGIN
  IF p_mission_number < 1 OR p_mission_number > 6 THEN
    RAISE EXCEPTION 'Mission number must be between 1 and 6';
  END IF;

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
  WHERE id = public.static_mission_id(p_mission_number);

  IF v_mission.enabled IS NOT TRUE OR v_mission.is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Mission is disabled';
  END IF;

  IF NOT public.is_static_mission_unlocked(v_team.id, p_mission_number) THEN
    RAISE EXCEPTION 'Mission is locked';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mission_participations mp
    WHERE mp.team_id = v_team.id
      AND mp.mission_id <> v_mission.id
      AND mp.status IN ('outside', 'pending_entry', 'inside', 'pending_exit')
  ) THEN
    RAISE EXCEPTION 'Team is already engaged in another mission';
  END IF;

  INSERT INTO public.mission_participations (mission_id, team_id, status, joined_at)
  VALUES (v_mission.id, v_team.id, 'outside', now())
  ON CONFLICT (mission_id, team_id)
  DO UPDATE SET
    status = CASE
      WHEN public.mission_participations.status = 'completed' THEN 'completed'
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

CREATE OR REPLACE FUNCTION public.complete_static_mission(
  p_mission_number INTEGER,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_mission public.missions;
  v_part public.mission_participations;
  v_valid BOOLEAN := false;
  v_group_number INTEGER;
  v_group_hash TEXT;
  v_resource RECORD;
BEGIN
  IF p_mission_number < 1 OR p_mission_number > 5 THEN
    RAISE EXCEPTION 'Only missions 1 to 5 are password-completed';
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant team not found';
  END IF;

  SELECT * INTO v_mission
  FROM public.missions
  WHERE id = public.static_mission_id(p_mission_number);

  SELECT * INTO v_part
  FROM public.mission_participations
  WHERE team_id = v_team.id
    AND mission_id = v_mission.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join mission before completion';
  END IF;

  IF v_part.status = 'completed' THEN
    RAISE EXCEPTION 'Mission already completed';
  END IF;

  IF p_mission_number = 1 THEN
    SELECT COALESCE(tmp.finish_password_hash, tmp.entry_password_hash) INTO v_group_hash
    FROM public.team_mission_passwords tmp
    WHERE tmp.team_id = v_team.id AND tmp.mission_id = v_mission.id;

    IF v_group_hash IS NOT NULL THEN
      v_valid := extensions.crypt(p_password, v_group_hash) = v_group_hash;
    ELSE
      v_valid := extensions.crypt(p_password, v_mission.finish_password_hash) = v_mission.finish_password_hash;
    END IF;
  ELSIF p_mission_number = 2 THEN
    v_group_number := public.static_team_group_number(v_team.id);
    SELECT password_hash INTO v_group_hash
    FROM public.mission2_group_passwords
    WHERE group_number = v_group_number;

    IF v_group_hash IS NULL THEN
      RAISE EXCEPTION 'Mission 2 group password not configured';
    END IF;

    v_valid := extensions.crypt(p_password, v_group_hash) = v_group_hash;
  ELSE
    v_valid := extensions.crypt(p_password, v_mission.finish_password_hash) = v_mission.finish_password_hash;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_PASSWORD';
  END IF;

  UPDATE public.mission_participations
  SET status = 'completed',
      completed_at = now(),
      exit_requested_at = now()
  WHERE id = v_part.id
  RETURNING * INTO v_part;

  INSERT INTO public.mission_completions (mission_id, team_id, completion_position, completed_at)
  VALUES (
    v_mission.id,
    v_team.id,
    COALESCE((SELECT MAX(mc.completion_position) + 1 FROM public.mission_completions mc WHERE mc.mission_id = v_mission.id), 1),
    now()
  )
  ON CONFLICT (mission_id, team_id) DO NOTHING;

  IF p_mission_number IN (4, 5) THEN
    SELECT * INTO v_resource
    FROM public.mission_static_resources
    WHERE mission_number = p_mission_number;

    IF FOUND THEN
      INSERT INTO public.team_mission_static_resources (team_id, mission_number, resource_type, resource_value)
      VALUES (v_team.id, p_mission_number, v_resource.resource_type, v_resource.resource_value)
      ON CONFLICT (team_id, mission_number)
      DO UPDATE SET
        resource_type = EXCLUDED.resource_type,
        resource_value = EXCLUDED.resource_value,
        granted_at = now();

      RETURN jsonb_build_object(
        'success', true,
        'resource_type', v_resource.resource_type,
        'resource_value', v_resource.resource_value
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_static_missions_for_team()
RETURNS TABLE (
  mission_number INTEGER,
  mission_id UUID,
  name TEXT,
  description TEXT,
  enabled BOOLEAN,
  unlocked BOOLEAN,
  status TEXT,
  is_joined BOOLEAN,
  can_join BOOLEAN,
  is_final BOOLEAN,
  resource_type TEXT,
  resource_value TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams;
BEGIN
  SELECT * INTO v_team
  FROM public.teams
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant team not found';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      m.sequence_number AS mission_number,
      m.id AS mission_id,
      m.name,
      m.description,
      m.enabled,
      m.is_final_submission AS is_final
    FROM public.missions m
    WHERE m.sequence_number BETWEEN 1 AND 6
  ),
  part AS (
    SELECT
      mp.mission_id,
      mp.status
    FROM public.mission_participations mp
    WHERE mp.team_id = v_team.id
  )
  SELECT
    b.mission_number,
    b.mission_id,
    b.name,
    b.description,
    b.enabled,
    public.is_static_mission_unlocked(v_team.id, b.mission_number) AS unlocked,
    COALESCE(p.status, 'not_joined') AS status,
    (p.mission_id IS NOT NULL AND COALESCE(p.status, '') <> 'completed') AS is_joined,
    (
      public.is_static_mission_unlocked(v_team.id, b.mission_number)
      AND b.enabled
      AND COALESCE(p.status, 'not_joined') = 'not_joined'
      AND NOT EXISTS (
        SELECT 1
        FROM public.mission_participations mp2
        WHERE mp2.team_id = v_team.id
          AND mp2.status IN ('outside', 'pending_entry', 'inside', 'pending_exit')
          AND mp2.mission_id <> b.mission_id
      )
    ) AS can_join,
    b.is_final,
    tr.resource_type,
    tr.resource_value
  FROM base b
  LEFT JOIN part p ON p.mission_id = b.mission_id
  LEFT JOIN public.team_mission_static_resources tr
    ON tr.team_id = v_team.id AND tr.mission_number = b.mission_number
  ORDER BY b.mission_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_mission2_group_password(
  p_group_number INTEGER,
  p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  INSERT INTO public.mission2_group_passwords (group_number, password_hash, updated_at)
  VALUES (p_group_number, extensions.crypt(p_password, extensions.gen_salt('bf')), now())
  ON CONFLICT (group_number)
  DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_static_mission_resource(
  p_mission_number INTEGER,
  p_resource_type TEXT,
  p_resource_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_mission_number NOT IN (4, 5) THEN
    RAISE EXCEPTION 'Resources can be configured only for missions 4 and 5';
  END IF;

  INSERT INTO public.mission_static_resources (
    mission_number,
    resource_type,
    resource_value,
    updated_at
  )
  VALUES (p_mission_number, p_resource_type, p_resource_value, now())
  ON CONFLICT (mission_number)
  DO UPDATE SET
    resource_type = EXCLUDED.resource_type,
    resource_value = EXCLUDED.resource_value,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mission_static_resources_admin()
RETURNS TABLE (
  mission_number INTEGER,
  resource_type TEXT,
  resource_value TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    r.mission_number,
    r.resource_type,
    r.resource_value,
    r.updated_at
  FROM public.mission_static_resources r
  ORDER BY r.mission_number;
END;
$$;
