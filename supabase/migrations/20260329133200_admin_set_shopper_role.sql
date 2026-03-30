CREATE OR REPLACE FUNCTION public.admin_set_shopper_role(p_email TEXT, p_enable BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can manage shopper accounts';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found for email %', p_email;
  END IF;

  IF p_enable THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'shopper')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = v_user_id
      AND role = 'shopper';
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'enabled', p_enable);
END;
$$;
