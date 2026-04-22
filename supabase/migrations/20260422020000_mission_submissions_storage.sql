-- Storage bucket and policies for final mission submissions.

INSERT INTO storage.buckets (id, name, public)
VALUES ('mission-submissions', 'mission-submissions', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Mission submissions are readable by authenticated users" ON storage.objects;
CREATE POLICY "Mission submissions are readable by authenticated users" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'mission-submissions');

DROP POLICY IF EXISTS "Authenticated users can upload mission submissions" ON storage.objects;
CREATE POLICY "Authenticated users can upload mission submissions" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mission-submissions');

DROP POLICY IF EXISTS "Authenticated users can update mission submissions" ON storage.objects;
CREATE POLICY "Authenticated users can update mission submissions" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'mission-submissions')
  WITH CHECK (bucket_id = 'mission-submissions');

DROP POLICY IF EXISTS "Authenticated users can delete mission submissions" ON storage.objects;
CREATE POLICY "Authenticated users can delete mission submissions" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mission-submissions');
