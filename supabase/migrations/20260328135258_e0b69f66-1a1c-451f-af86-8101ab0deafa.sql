
-- Fix the overly permissive notification insert policy
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Authenticated can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'shopper')
    OR user_id = auth.uid()
  );
