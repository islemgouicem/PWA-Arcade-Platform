-- Role bootstrap hardening for admin/shopper accounts
-- 1) Only create participant team/role on signup when team_name exists
-- 2) Enforce participant/admin-shopper role separation

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_name TEXT;
BEGIN
  v_team_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'team_name', '')), '');

  IF v_team_name IS NOT NULL THEN
    INSERT INTO public.teams (user_id, team_name)
    VALUES (NEW.id, v_team_name);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'participant')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_role_separation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'participant' THEN
    IF EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = NEW.user_id
        AND ur.role IN ('admin', 'shopper')
    ) THEN
      RAISE EXCEPTION 'participant role cannot be combined with admin/shopper for user %', NEW.user_id;
    END IF;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = NEW.user_id
      AND role = 'participant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_role_separation ON public.user_roles;
CREATE TRIGGER trg_enforce_role_separation
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_role_separation();

-- Clean up legacy data from earlier bootstrap behavior.
DELETE FROM public.user_roles ur
WHERE ur.role = 'participant'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles elevated
    WHERE elevated.user_id = ur.user_id
      AND elevated.role IN ('admin', 'shopper')
  );
