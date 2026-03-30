CREATE OR REPLACE FUNCTION public.notify_admins_on_full_mandatory_set()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_total_mandatory INTEGER;
  v_team_mandatory INTEGER;
BEGIN
  v_team_id := COALESCE(NEW.team_id, OLD.team_id);

  SELECT COUNT(*) INTO v_total_mandatory
  FROM public.cards
  WHERE is_mandatory = true;

  IF v_total_mandatory = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(DISTINCT tc.card_id) INTO v_team_mandatory
  FROM public.team_cards tc
  JOIN public.cards c ON c.id = tc.card_id
  WHERE tc.team_id = v_team_id
    AND tc.quantity > 0
    AND c.is_mandatory = true;

  IF v_team_mandatory >= v_total_mandatory THEN
    INSERT INTO public.notifications (user_id, team_id, type, title, message, metadata)
    SELECT ur.user_id,
           v_team_id,
           'quest_completed',
           'Potential Winner Alert',
           'A team now holds all mandatory cards. Review winner declaration.',
           jsonb_build_object('team_id', v_team_id, 'kind', 'mandatory_complete')
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.metadata ->> 'team_id' = v_team_id::text
          AND n.metadata ->> 'kind' = 'mandatory_complete'
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_team_cards_mandatory_notify ON public.team_cards;
CREATE TRIGGER trg_team_cards_mandatory_notify
AFTER INSERT OR UPDATE OR DELETE ON public.team_cards
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_full_mandatory_set();
