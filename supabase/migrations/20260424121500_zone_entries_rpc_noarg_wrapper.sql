-- Compatibility wrapper for PostgREST RPC resolution.
-- Some clients call get_zone_entries_for_team without parameters.

CREATE OR REPLACE FUNCTION public.get_zone_entries_for_team()
RETURNS TABLE (
  id UUID,
  zone_id UUID,
  team_id UUID,
  status TEXT,
  entry_requested_at TIMESTAMPTZ,
  mission_zones JSONB,
  current_health NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.get_zone_entries_for_team(NULL::UUID);
END;
$$;
