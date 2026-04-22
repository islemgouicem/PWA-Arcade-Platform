-- Allow participant zone entry without password while requiring handlers to unlock zones with a password.

CREATE OR REPLACE FUNCTION public.team_request_zone_entry(
  p_zone_id UUID,
  p_password TEXT DEFAULT NULL
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
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  SELECT * INTO v_zone
  FROM public.mission_zones
  WHERE id = p_zone_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Zone not found');
  END IF;

  IF p_password IS NOT NULL AND btrim(p_password) <> '' THEN
    IF v_zone.password_hash <> extensions.crypt(p_password, v_zone.password_hash) THEN
      RETURN jsonb_build_object('error', 'Invalid zone password');
    END IF;
  END IF;

  SELECT * INTO v_entry
  FROM public.zone_entries
  WHERE zone_id = p_zone_id AND team_id = v_team_id;

  IF FOUND THEN
    UPDATE public.zone_entries
    SET status = 'pending',
        entry_requested_at = now()
    WHERE zone_id = p_zone_id AND team_id = v_team_id;
  ELSE
    INSERT INTO public.zone_entries (zone_id, team_id, status)
    VALUES (p_zone_id, v_team_id, 'pending');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Zone entry requested'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_zone_handler_access(
  p_zone_id UUID,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone public.mission_zones;
BEGIN
  IF NOT (
    public.has_role_text(auth.uid(), 'mission_responsible')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role_text(auth.uid(), 'zone_handler')
  ) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT * INTO v_zone
  FROM public.mission_zones
  WHERE id = p_zone_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Zone not found');
  END IF;

  IF v_zone.password_hash <> extensions.crypt(p_password, v_zone.password_hash) THEN
    RETURN jsonb_build_object('error', 'Invalid zone password');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'zone_id', v_zone.id,
    'zone_name', v_zone.name,
    'zone_type', v_zone.zone_type
  );
END;
$$;