-- Fix Mission 6 access scope:
-- Only static missions 1..5 should be prerequisites for final submission.

CREATE OR REPLACE FUNCTION public.can_access_final_mission(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.missions m
    WHERE m.sequence_number BETWEEN 1 AND 5
      AND NOT EXISTS (
        SELECT 1
        FROM public.mission_completions mc
        WHERE mc.mission_id = m.id
          AND mc.team_id = p_team_id
      )
  );
END;
$$;
