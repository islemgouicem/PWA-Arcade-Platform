-- Enforce the cards model to exactly four active shop card types:
-- Hint, Healing, Attack, Defend.

DO $$
DECLARE
  v_latest_mission UUID;
  v_hint_card UUID;
  v_heal_card UUID;
  v_attack_card UUID;
  v_defend_card UUID;
BEGIN
  SELECT id INTO v_latest_mission
  FROM public.missions
  ORDER BY created_at DESC
  LIMIT 1;

  -- Hint Card (hint_single)
  SELECT id INTO v_hint_card
  FROM public.cards
  WHERE card_type = 'hint_single'
  ORDER BY sort_order, created_at
  LIMIT 1;

  IF v_hint_card IS NULL THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Hint Card',
      'Reveal a random predefined hint for the active mission and matching level.',
      'hint_single',
      'ordinary',
      0,
      NULL,
      false,
      false,
      'Hint card content is provided dynamically from the hints table.',
      NULL,
      NULL,
      1,
      40,
      true,
      true,
      0,
      0,
      1,
      v_latest_mission
    ) RETURNING id INTO v_hint_card;
  ELSE
    UPDATE public.cards
    SET name = 'Hint Card',
        description = 'Reveal a random predefined hint for the active mission and matching level.',
        rarity = 'ordinary',
        shop_price = COALESCE(shop_price, 40),
        shop_visible = true,
        shop_enabled = true,
        effect_percent = 0,
        effect_duration_minutes = 0,
        hint_level = GREATEST(COALESCE(hint_level, 1), 1),
        linked_mission_id = COALESCE(linked_mission_id, v_latest_mission),
        sort_order = 1,
        is_mandatory = false
    WHERE id = v_hint_card;
  END IF;

  UPDATE public.cards
  SET shop_visible = false,
      shop_enabled = false
  WHERE card_type = 'hint_single'
    AND id <> v_hint_card;

  -- Healing Card (recovery)
  SELECT id INTO v_heal_card
  FROM public.cards
  WHERE card_type = 'recovery'
  ORDER BY sort_order, created_at
  LIMIT 1;

  IF v_heal_card IS NULL THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Healing Card',
      'Increase your team Health Status by admin-configured percent.',
      'recovery',
      'rare',
      0,
      NULL,
      false,
      false,
      NULL,
      NULL,
      NULL,
      2,
      70,
      true,
      true,
      15,
      0,
      1,
      NULL
    ) RETURNING id INTO v_heal_card;
  ELSE
    UPDATE public.cards
    SET name = 'Healing Card',
        description = 'Increase your team Health Status by admin-configured percent.',
        rarity = 'rare',
        shop_price = COALESCE(shop_price, 70),
        shop_visible = true,
        shop_enabled = true,
        effect_percent = GREATEST(COALESCE(effect_percent, 15), 0),
        effect_duration_minutes = 0,
        sort_order = 2,
        is_mandatory = false
    WHERE id = v_heal_card;
  END IF;

  UPDATE public.cards
  SET shop_visible = false,
      shop_enabled = false
  WHERE card_type = 'recovery'
    AND id <> v_heal_card;

  -- Attack Card (manipulation)
  SELECT id INTO v_attack_card
  FROM public.cards
  WHERE card_type = 'manipulation'
  ORDER BY sort_order, created_at
  LIMIT 1;

  IF v_attack_card IS NULL THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Attack Card',
      'Reduce a selected target team Health Status by admin-configured percent.',
      'manipulation',
      'epic',
      0,
      NULL,
      false,
      false,
      NULL,
      NULL,
      NULL,
      3,
      100,
      true,
      true,
      15,
      0,
      1,
      NULL
    ) RETURNING id INTO v_attack_card;
  ELSE
    UPDATE public.cards
    SET name = 'Attack Card',
        description = 'Reduce a selected target team Health Status by admin-configured percent.',
        rarity = 'epic',
        shop_price = COALESCE(shop_price, 100),
        shop_visible = true,
        shop_enabled = true,
        effect_percent = GREATEST(COALESCE(effect_percent, 15), 0),
        effect_duration_minutes = 0,
        sort_order = 3,
        is_mandatory = false
    WHERE id = v_attack_card;
  END IF;

  UPDATE public.cards
  SET shop_visible = false,
      shop_enabled = false
  WHERE card_type = 'manipulation'
    AND id <> v_attack_card;

  -- Defend Card (protection)
  SELECT id INTO v_defend_card
  FROM public.cards
  WHERE card_type = 'protection'
  ORDER BY sort_order, created_at
  LIMIT 1;

  IF v_defend_card IS NULL THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Defend Card',
      'Protect your team from incoming attacks during configured duration.',
      'protection',
      'epic',
      0,
      NULL,
      false,
      false,
      NULL,
      NULL,
      NULL,
      4,
      110,
      true,
      true,
      0,
      30,
      1,
      NULL
    ) RETURNING id INTO v_defend_card;
  ELSE
    UPDATE public.cards
    SET name = 'Defend Card',
        description = 'Protect your team from incoming attacks during configured duration.',
        rarity = 'epic',
        shop_price = COALESCE(shop_price, 110),
        shop_visible = true,
        shop_enabled = true,
        effect_percent = 0,
        effect_duration_minutes = GREATEST(COALESCE(effect_duration_minutes, 30), 1),
        sort_order = 4,
        is_mandatory = false
    WHERE id = v_defend_card;
  END IF;

  UPDATE public.cards
  SET shop_visible = false,
      shop_enabled = false
  WHERE card_type = 'protection'
    AND id <> v_defend_card;

  -- Explicitly disable legacy or unsupported card types from shop usage.
  UPDATE public.cards
  SET shop_visible = false,
      shop_enabled = false
  WHERE card_type IN ('enhancement', 'penalizing', 'economic', 'hint_combined', 'mandatory');

  -- Ensure there is at least one predefined hint row for Hint Card.
  IF v_latest_mission IS NOT NULL THEN
    INSERT INTO public.card_hints (card_id, mission_id, level, hint_text, is_active)
    VALUES (
      v_hint_card,
      v_latest_mission,
      1,
      'Default hint: mission clues are resolved from predefined records by level.',
      true
    ) ON CONFLICT DO NOTHING;
  END IF;
END $$;
