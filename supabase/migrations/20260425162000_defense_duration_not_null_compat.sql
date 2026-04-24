-- Compatibility fix:
-- cards.effect_duration_minutes is NOT NULL in deployed schema.
-- Defense is passive, so we store 0 (instead of NULL) to avoid constraint errors.

CREATE OR REPLACE FUNCTION public.admin_set_card_shop_config(
  p_card_id UUID,
  p_shop_price INTEGER,
  p_shop_visible BOOLEAN,
  p_shop_enabled BOOLEAN,
  p_effect_percent NUMERIC,
  p_effect_duration_minutes INTEGER,
  p_hint_level INTEGER,
  p_linked_mission_id UUID DEFAULT NULL,
  p_reward_enabled BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_type public.card_type;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can manage card shop configuration';
  END IF;

  SELECT card_type INTO v_card_type
  FROM public.cards
  WHERE id = p_card_id;

  IF v_card_type IS NULL THEN
    RAISE EXCEPTION 'Card not found';
  END IF;

  UPDATE public.cards
  SET shop_price = COALESCE(p_shop_price, shop_price),
      shop_visible = COALESCE(p_shop_visible, shop_visible),
      shop_enabled = COALESCE(p_shop_enabled, shop_enabled),
      reward_enabled = CASE
        WHEN v_card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN false
        ELSE COALESCE(p_reward_enabled, reward_enabled)
      END,
      effect_percent = COALESCE(p_effect_percent, effect_percent),
      effect_duration_minutes = CASE
        WHEN v_card_type = 'defense' THEN 0
        ELSE COALESCE(p_effect_duration_minutes, effect_duration_minutes)
      END,
      hint_level = COALESCE(p_hint_level, hint_level),
      linked_mission_id = CASE
        WHEN v_card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN NULL
        WHEN p_linked_mission_id IS NOT NULL THEN p_linked_mission_id
        ELSE linked_mission_id
      END
  WHERE id = p_card_id;
END;
$$;
