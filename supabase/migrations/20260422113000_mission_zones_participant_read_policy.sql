-- Allow participant teams to read zones for missions they have joined.
-- Keeps RLS enabled while exposing mission zones to team-side mission cards.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mission_zones'
      AND policyname = 'Teams can read joined mission zones'
  ) THEN
    CREATE POLICY "Teams can read joined mission zones"
    ON public.mission_zones
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.teams t
        JOIN public.mission_participations mp ON mp.team_id = t.id
        WHERE t.user_id = auth.uid()
          AND mp.mission_id = mission_zones.mission_id
      )
    );
  END IF;
END $$;
