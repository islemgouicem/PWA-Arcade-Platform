-- Process shopper approvals/rejections as atomic DB transactions
-- Covers real transfers for trade/sell/buy and enforces exclusive mandatory protection.

CREATE OR REPLACE FUNCTION public.apply_card_delta(p_team_id UUID, p_card_id UUID, p_delta INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.team_cards%ROWTYPE;
  v_new_qty INTEGER;
BEGIN
  SELECT * INTO v_row
  FROM public.team_cards
  WHERE team_id = p_team_id AND card_id = p_card_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    IF p_delta > 0 THEN
      INSERT INTO public.team_cards (team_id, card_id, quantity)
      VALUES (p_team_id, p_card_id, p_delta);
      RETURN;
    END IF;

    RAISE EXCEPTION 'Card % not owned by team %', p_card_id, p_team_id;
  END IF;

  v_new_qty := v_row.quantity + p_delta;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Insufficient card quantity for team % card %', p_team_id, p_card_id;
  ELSIF v_new_qty = 0 THEN
    DELETE FROM public.team_cards WHERE id = v_row.id;
  ELSE
    UPDATE public.team_cards
    SET quantity = v_new_qty
    WHERE id = v_row.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_trade_request(
  p_request_id UUID,
  p_action TEXT,
  p_actor_user_id UUID,
  p_reject_reason TEXT DEFAULT NULL,
  p_target_team_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.trade_requests%ROWTYPE;
  v_offer_card public.cards%ROWTYPE;
  v_wanted_card public.cards%ROWTYPE;
  v_requester public.teams%ROWTYPE;
  v_target public.teams%ROWTYPE;
  v_target_team_id UUID;
  v_store_item public.store_inventory%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'shopper') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only shopper/admin can process requests';
  END IF;

  SELECT * INTO v_req
  FROM public.trade_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Trade request not found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Trade request is not pending';
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.trade_requests
    SET status = 'rejected',
        reject_reason = COALESCE(NULLIF(trim(p_reject_reason), ''), 'Rejected by Shopper'),
        processed_by = p_actor_user_id,
        updated_at = now()
    WHERE id = v_req.id;

    INSERT INTO public.notifications (user_id, team_id, type, title, message)
    SELECT t.user_id, t.id, 'trade_rejected', 'Request Rejected',
           COALESCE(NULLIF(trim(p_reject_reason), ''), 'Your request was rejected by the shopper.')
    FROM public.teams t
    WHERE t.id = v_req.team_id;

    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  IF p_action <> 'approve' THEN
    RAISE EXCEPTION 'Unsupported action: %', p_action;
  END IF;

  SELECT * INTO v_requester FROM public.teams WHERE id = v_req.team_id FOR UPDATE;

  IF v_requester.id IS NULL THEN
    RAISE EXCEPTION 'Requester team not found';
  END IF;

  IF v_req.request_type = 'trade' THEN
    IF v_req.offered_card_id IS NULL OR v_req.wanted_card_id IS NULL THEN
      RAISE EXCEPTION 'Trade request missing offered/wanted card';
    END IF;

    SELECT * INTO v_offer_card FROM public.cards WHERE id = v_req.offered_card_id;
    SELECT * INTO v_wanted_card FROM public.cards WHERE id = v_req.wanted_card_id;

    IF (v_offer_card.is_mandatory AND v_offer_card.is_exclusive)
       OR (v_wanted_card.is_mandatory AND v_wanted_card.is_exclusive) THEN
      RAISE EXCEPTION 'Exclusive mandatory cards cannot be traded';
    END IF;

    v_target_team_id := COALESCE(v_req.target_team_id, p_target_team_id);

    IF v_target_team_id IS NULL THEN
      SELECT tc.team_id INTO v_target_team_id
      FROM public.team_cards tc
      WHERE tc.card_id = v_req.wanted_card_id
        AND tc.team_id <> v_req.team_id
        AND tc.quantity > 0
      ORDER BY tc.acquired_at
      LIMIT 1;
    END IF;

    IF v_target_team_id IS NULL THEN
      RAISE EXCEPTION 'No target team available with requested card';
    END IF;

    SELECT * INTO v_target FROM public.teams WHERE id = v_target_team_id FOR UPDATE;

    PERFORM public.apply_card_delta(v_requester.id, v_req.offered_card_id, -1);
    PERFORM public.apply_card_delta(v_target.id, v_req.offered_card_id, 1);

    PERFORM public.apply_card_delta(v_target.id, v_req.wanted_card_id, -1);
    PERFORM public.apply_card_delta(v_requester.id, v_req.wanted_card_id, 1);

    UPDATE public.trade_requests
    SET status = 'completed',
        processed_by = p_actor_user_id,
        target_team_id = v_target.id,
        updated_at = now()
    WHERE id = v_req.id;

    INSERT INTO public.notifications (user_id, team_id, type, title, message)
    SELECT t.user_id, t.id, 'trade_completed', 'Trade Completed',
           'Your trade request was completed.'
    FROM public.teams t
    WHERE t.id = v_requester.id;

    INSERT INTO public.notifications (user_id, team_id, type, title, message)
    SELECT t.user_id, t.id, 'trade_completed', 'Trade Completed',
           'A trade involving your team was completed.'
    FROM public.teams t
    WHERE t.id = v_target.id;

    RETURN jsonb_build_object('ok', true, 'status', 'completed', 'type', 'trade', 'target_team_id', v_target.id);
  END IF;

  IF v_req.request_type = 'sell' THEN
    IF v_req.offered_card_id IS NULL OR v_req.price IS NULL OR v_req.price < 0 THEN
      RAISE EXCEPTION 'Sell request missing card or price';
    END IF;

    SELECT * INTO v_offer_card FROM public.cards WHERE id = v_req.offered_card_id;

    IF v_offer_card.is_mandatory AND v_offer_card.is_exclusive THEN
      RAISE EXCEPTION 'Exclusive mandatory cards cannot be sold';
    END IF;

    PERFORM public.apply_card_delta(v_requester.id, v_req.offered_card_id, -1);

    INSERT INTO public.store_inventory (card_id, price, quantity, listed_by)
    VALUES (v_req.offered_card_id, v_req.price, 1, p_actor_user_id);

    UPDATE public.teams
    SET points = points + v_req.price,
        updated_at = now()
    WHERE id = v_requester.id;

    UPDATE public.trade_requests
    SET status = 'completed',
        processed_by = p_actor_user_id,
        updated_at = now()
    WHERE id = v_req.id;

    INSERT INTO public.notifications (user_id, team_id, type, title, message)
    SELECT t.user_id, t.id, 'trade_completed', 'Sell Completed',
           format('Your card was sold to the store for %s points.', v_req.price)
    FROM public.teams t
    WHERE t.id = v_requester.id;

    RETURN jsonb_build_object('ok', true, 'status', 'completed', 'type', 'sell');
  END IF;

  IF v_req.request_type = 'buy' THEN
    IF v_req.wanted_card_id IS NULL OR v_req.price IS NULL OR v_req.price < 0 THEN
      RAISE EXCEPTION 'Buy request missing card or price';
    END IF;

    SELECT * INTO v_wanted_card FROM public.cards WHERE id = v_req.wanted_card_id;

    IF v_wanted_card.is_mandatory AND v_wanted_card.is_exclusive THEN
      RAISE EXCEPTION 'Exclusive mandatory cards cannot be purchased';
    END IF;

    IF v_requester.points < v_req.price THEN
      RAISE EXCEPTION 'Team does not have enough points';
    END IF;

    SELECT * INTO v_store_item
    FROM public.store_inventory si
    WHERE si.card_id = v_req.wanted_card_id
      AND si.price = v_req.price
      AND si.quantity > 0
    ORDER BY si.created_at
    LIMIT 1
    FOR UPDATE;

    IF v_store_item.id IS NULL THEN
      RAISE EXCEPTION 'Requested store item is no longer available';
    END IF;

    UPDATE public.teams
    SET points = points - v_req.price,
        updated_at = now()
    WHERE id = v_requester.id;

    IF v_store_item.quantity = 1 THEN
      DELETE FROM public.store_inventory WHERE id = v_store_item.id;
    ELSE
      UPDATE public.store_inventory
      SET quantity = quantity - 1
      WHERE id = v_store_item.id;
    END IF;

    PERFORM public.apply_card_delta(v_requester.id, v_req.wanted_card_id, 1);

    UPDATE public.trade_requests
    SET status = 'completed',
        processed_by = p_actor_user_id,
        updated_at = now()
    WHERE id = v_req.id;

    INSERT INTO public.notifications (user_id, team_id, type, title, message)
    SELECT t.user_id, t.id, 'trade_completed', 'Purchase Completed',
           format('Purchase completed for %s points.', v_req.price)
    FROM public.teams t
    WHERE t.id = v_requester.id;

    RETURN jsonb_build_object('ok', true, 'status', 'completed', 'type', 'buy');
  END IF;

  RAISE EXCEPTION 'Unsupported request type: %', v_req.request_type;
END;
$$;