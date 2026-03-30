-- Storage bucket and policies for admin-managed card images.

INSERT INTO storage.buckets (id, name, public)
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Card images are publicly readable" ON storage.objects;
CREATE POLICY "Card images are publicly readable" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'card-images');

DROP POLICY IF EXISTS "Admins can upload card images" ON storage.objects;
CREATE POLICY "Admins can upload card images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'card-images'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can update card images" ON storage.objects;
CREATE POLICY "Admins can update card images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'card-images'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'card-images'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete card images" ON storage.objects;
CREATE POLICY "Admins can delete card images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'card-images'
    AND public.has_role(auth.uid(), 'admin')
  );
