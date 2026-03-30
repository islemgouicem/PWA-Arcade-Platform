-- Admin workflow hardening and event notifications
-- Note: kept local until you decide to push migrations.

ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS contact_email TEXT;

UPDATE public.teams t
SET contact_email = u.email
FROM auth.users u
WHERE t.user_id = u.id
  AND t.contact_email IS NULL;

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
    INSERT INTO public.teams (user_id, team_name, contact_email)
    VALUES (NEW.id, v_team_name, NEW.email);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'participant')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_card_activation(
  p_team_id UUID,
  p_card_id UUID,
  p_target_team_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation_open BOOLEAN := true;
  v_winner_declared BOOLEAN := false;
  v_card public.cards%ROWTYPE;
  v_team_user_id UUID;
BEGIN
  SELECT value::text = 'true' INTO v_activation_open
  FROM public.platform_settings
  WHERE key = 'activation_window_open';

  SELECT value::text = 'true' INTO v_winner_declared
  FROM public.platform_settings
  WHERE key = 'winner_declared';

  IF COALESCE(v_activation_open, true) IS NOT TRUE OR COALESCE(v_winner_declared, false) IS TRUE THEN
    RAISE EXCEPTION 'Card activation is currently blocked';
  END IF;

  SELECT user_id INTO v_team_user_id FROM public.teams WHERE id = p_team_id;
  IF v_team_user_id IS NULL OR v_team_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You are not allowed to activate for this team';
  END IF;

  SELECT * INTO v_card FROM public.cards WHERE id = p_card_id;
  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'Card not found';
  END IF;

  PERFORM public.apply_card_delta(p_team_id, p_card_id, -1);

  INSERT INTO public.card_activations (team_id, card_id, target_team_id, card_name, card_rarity)
  VALUES (p_team_id, p_card_id, p_target_team_id, v_card.name, v_card.rarity);

  INSERT INTO public.notifications (user_id, team_id, type, title, message)
  VALUES (auth.uid(), p_team_id, 'card_activated', 'Card Activated', format('%s activated successfully.', v_card.name));

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_card_activation(
  p_activation_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation public.card_activations%ROWTYPE;
  v_grace_minutes INTEGER := 10;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can reverse activation';
  END IF;

  SELECT COALESCE((value #>> '{}')::int, 10)
  INTO v_grace_minutes
  FROM public.platform_settings
  WHERE key = 'activation_reverse_grace_minutes';

  SELECT * INTO v_activation
  FROM public.card_activations
  WHERE id = p_activation_id
  FOR UPDATE;

  IF v_activation.id IS NULL THEN
    RAISE EXCEPTION 'Activation not found';
  END IF;

  IF v_activation.is_cancelled THEN
    RAISE EXCEPTION 'Activation already cancelled';
  END IF;

  IF v_activation.created_at < now() - make_interval(mins => v_grace_minutes) THEN
    RAISE EXCEPTION 'Activation is outside grace period';
  END IF;

  UPDATE public.card_activations
  SET is_cancelled = true,
      cancelled_at = now()
  WHERE id = p_activation_id;

  PERFORM public.apply_card_delta(v_activation.team_id, v_activation.card_id, 1);

  INSERT INTO public.notifications (user_id, team_id, type, title, message)
  SELECT t.user_id, t.id, 'card_activated', 'Activation Reversed',
         format('An admin reversed %s activation. Reason: %s', v_activation.card_name, COALESCE(NULLIF(trim(p_reason), ''), 'No reason provided'))
  FROM public.teams t
  WHERE t.id = v_activation.team_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_quest_completion_atomic(p_quest_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $validate$
DECLARE
  v_qt public.quest_teams%ROWTYPE;
  v_quest public.side_quests%ROWTYPE;
  v_coffre_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can validate quest completion';
  END IF;

  SELECT * INTO v_qt
  FROM public.quest_teams
  WHERE id = p_quest_team_id
  FOR UPDATE;

  IF v_qt.id IS NULL THEN
    RAISE EXCEPTION 'Quest team row not found';
  END IF;

  IF v_qt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Quest is not in progress';
  END IF;

  SELECT * INTO v_quest
  FROM public.side_quests
  WHERE id = v_qt.quest_id
  FOR UPDATE;

  IF v_quest.slots_filled >= v_quest.max_slots THEN
    RAISE EXCEPTION 'Quest reward slots are full';
  END IF;

  UPDATE public.side_quests
  SET slots_filled = slots_filled + 1,
      updated_at = now()
  WHERE id = v_quest.id;

  UPDATE public.quest_teams
  SET status = 'completed',
      updated_at = now()
  WHERE id = v_qt.id;

  IF v_quest.reward_card_id IS NOT NULL THEN
    INSERT INTO public.coffres (team_id, coffre_type, source_label)
    VALUES (v_qt.team_id, 'quest_reward', 'Quest: ' || v_quest.title)
    RETURNING id INTO v_coffre_id;

    INSERT INTO public.coffre_cards (coffre_id, card_id)
    VALUES (v_coffre_id, v_quest.reward_card_id);

    UPDATE public.quest_teams
    SET status = 'reward_claimed',
        updated_at = now()
    WHERE id = v_qt.id;
  END IF;

  INSERT INTO public.notifications (user_id, team_id, type, title, message)
  SELECT t.user_id, t.id, 'quest_completed', 'Quest Reward Granted',
         format('Quest %s completion validated. Reward coffre added.', v_quest.title)
  FROM public.teams t
  WHERE t.id = v_qt.team_id;

  RETURN jsonb_build_object('ok', true);
END;
$validate$;