-- Server-side hardening for registration/trading/quests and atomic gift opening.

-- 1) Lock down direct inventory mutation function from client RPC calls.
REVOKE EXECUTE ON FUNCTION public.apply_card_delta(UUID, UUID, INTEGER) FROM anon, authenticated;

-- 2) Provide an admin-only override function with audit reason.
CREATE OR REPLACE FUNCTION public.admin_apply_card_override(
  p_team_id UUID,
  p_card_id UUID,
  p_delta INTEGER,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can run inventory overrides';
  END IF;

  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Delta must be non-zero';
  END IF;

  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Override reason is required';
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  PERFORM public.apply_card_delta(p_team_id, p_card_id, p_delta);

  INSERT INTO public.point_logs (team_id, amount, reason, admin_user_id)
  VALUES (
    p_team_id,
    0,
    format('Card inventory override (%s) - %s', CASE WHEN p_delta > 0 THEN '+' || p_delta::text ELSE p_delta::text END, trim(p_reason)),
    auth.uid()
  );

  INSERT INTO public.notifications (user_id, team_id, type, title, message)
  VALUES (
    v_team.user_id,
    v_team.id,
    'trade_completed',
    'Inventory Adjustment',
    format('Admin adjusted one of your card quantities (%s).', CASE WHEN p_delta > 0 THEN '+' || p_delta::text ELSE p_delta::text END)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3) Enforce trading window and winner freeze at policy level for request creation.
DROP POLICY IF EXISTS "Teams can insert own trade requests" ON public.trade_requests;
CREATE POLICY "Teams can insert own trade requests" ON public.trade_requests
  FOR INSERT TO authenticated WITH CHECK (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    AND COALESCE(
      (
        SELECT value::text = 'true'
        FROM public.platform_settings
        WHERE key = 'trading_window_open'
      ),
      false
    )
    AND NOT COALESCE(
      (
        SELECT value::text = 'true'
        FROM public.platform_settings
        WHERE key = 'winner_declared'
      ),
      false
    )
  );

-- 4) Enforce trading freeze while processing approvals too (reject still allowed).
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
  v_trading_open BOOLEAN := false;
  v_winner_declared BOOLEAN := false;
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

  SELECT value::text = 'true' INTO v_trading_open
  FROM public.platform_settings
  WHERE key = 'trading_window_open';

  SELECT value::text = 'true' INTO v_winner_declared
  FROM public.platform_settings
  WHERE key = 'winner_declared';

  IF COALESCE(v_trading_open, false) IS NOT TRUE OR COALESCE(v_winner_declared, false) IS TRUE THEN
    RAISE EXCEPTION 'Trading is currently closed';
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

-- 5) Enforce registration flag in server-side user bootstrap.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_name TEXT;
  v_registration_open BOOLEAN := true;
BEGIN
  v_team_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'team_name', '')), '');

  IF v_team_name IS NOT NULL THEN
    SELECT value::text = 'true' INTO v_registration_open
    FROM public.platform_settings
    WHERE key = 'registration_open';

    IF COALESCE(v_registration_open, true) IS NOT TRUE THEN
      RAISE EXCEPTION 'Registration is currently closed';
    END IF;

    INSERT INTO public.teams (user_id, team_name, contact_email)
    VALUES (NEW.id, v_team_name, NEW.email);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'participant')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 6) Harden quest enrollment checks at insert time.
DROP POLICY IF EXISTS "Teams can insert own quest registration" ON public.quest_teams;
CREATE POLICY "Teams can insert own quest registration" ON public.quest_teams
  FOR INSERT TO authenticated WITH CHECK (
    team_id IN (SELECT id FROM public.teams WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.side_quests sq
      WHERE sq.id = quest_id
        AND sq.is_published = true
        AND sq.slots_filled < sq.max_slots
    )
    AND NOT COALESCE(
      (
        SELECT value::text = 'true'
        FROM public.platform_settings
        WHERE key = 'winner_declared'
      ),
      false
    )
  );

-- 7) Atomic/Idempotent coffre opening and inventory grant.
CREATE OR REPLACE FUNCTION public.open_coffre_atomic(p_coffre_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_coffre public.coffres%ROWTYPE;
  v_cards JSONB;
BEGIN
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE user_id = auth.uid();

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Team profile not found';
  END IF;

  SELECT * INTO v_coffre
  FROM public.coffres
  WHERE id = p_coffre_id
    AND team_id = v_team_id
  FOR UPDATE;

  IF v_coffre.id IS NULL THEN
    RAISE EXCEPTION 'Coffre not found';
  END IF;

  IF v_coffre.is_opened THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'description', c.description,
          'card_type', c.card_type,
          'rarity', c.rarity,
          'image_url', c.image_url
        )
        ORDER BY c.sort_order, c.name
      ),
      '[]'::jsonb
    )
    INTO v_cards
    FROM public.coffre_cards cc
    JOIN public.cards c ON c.id = cc.card_id
    WHERE cc.coffre_id = v_coffre.id;

    RETURN jsonb_build_object('ok', true, 'already_opened', true, 'cards', v_cards);
  END IF;

  UPDATE public.coffres
  SET is_opened = true,
      opened_at = now()
  WHERE id = v_coffre.id;

  INSERT INTO public.team_cards (team_id, card_id, quantity)
  SELECT v_team_id, cc.card_id, 1
  FROM public.coffre_cards cc
  WHERE cc.coffre_id = v_coffre.id
  ON CONFLICT (team_id, card_id)
  DO UPDATE SET quantity = public.team_cards.quantity + EXCLUDED.quantity;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'card_type', c.card_type,
        'rarity', c.rarity,
        'image_url', c.image_url
      )
      ORDER BY c.sort_order, c.name
    ),
    '[]'::jsonb
  )
  INTO v_cards
  FROM public.coffre_cards cc
  JOIN public.cards c ON c.id = cc.card_id
  WHERE cc.coffre_id = v_coffre.id;

  RETURN jsonb_build_object('ok', true, 'already_opened', false, 'cards', v_cards);
END;
$$;
