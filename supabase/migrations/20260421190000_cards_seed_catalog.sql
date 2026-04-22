-- Seed starter cards for the shop-first cards system.
-- Idempotent: only inserts when the named card does not already exist.

DO $$
DECLARE
  v_mission_id UUID;
  v_hint_card_id UUID;
BEGIN
  SELECT id INTO v_mission_id
  FROM public.missions
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Spark Injector') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Spark Injector',
      'Restore a small amount of team health.',
      'recovery',
      'ordinary',
      10,
      NULL,
      false,
      false,
      NULL,
      NULL,
      NULL,
      1,
      50,
      true,
      true,
      15,
      0,
      1,
      NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Riot Patch') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Riot Patch',
      'Boost your team health ceiling for a short time.',
      'enhancement',
      'rare',
      15,
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
      20,
      30,
      1,
      NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Sabotage Pulse') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Sabotage Pulse',
      'Damage a target team through the holder flow.',
      'manipulation',
      'epic',
      25,
      NULL,
      false,
      false,
      NULL,
      NULL,
      NULL,
      3,
      110,
      true,
      true,
      18,
      0,
      1,
      NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Hex Mark') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Hex Mark',
      'Penalize a rival team using the activation flow.',
      'penalizing',
      'rare',
      20,
      NULL,
      false,
      false,
      NULL,
      NULL,
      NULL,
      4,
      95,
      true,
      true,
      12,
      0,
      1,
      NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Barrier Field') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Barrier Field',
      'Protect your team from one incoming attack window.',
      'protection',
      'epic',
      25,
      NULL,
      false,
      false,
      NULL,
      NULL,
      NULL,
      5,
      120,
      true,
      true,
      0,
      30,
      1,
      NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Intel Scraps') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Intel Scraps',
      'Reveal one mission hint at the configured hint level.',
      'hint_single',
      'ordinary',
      0,
      NULL,
      false,
      false,
      'A simple hint card for the active mission.',
      NULL,
      NULL,
      6,
      40,
      true,
      true,
      0,
      0,
      1,
      v_mission_id
    ) RETURNING id INTO v_hint_card_id;

    IF v_mission_id IS NOT NULL THEN
      INSERT INTO public.card_hints (card_id, mission_id, level, hint_text, is_active)
      VALUES (
        v_hint_card_id,
        v_mission_id,
        1,
        'Starter hint: check the mission flow and the team role assignments first.',
        true
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Mission Intel') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Mission Intel',
      'A stronger hint card tied to the latest active mission.',
      'hint_combined',
      'rare',
      0,
      NULL,
      false,
      false,
      'A stronger hint card for mission progress.',
      NULL,
      NULL,
      7,
      85,
      true,
      true,
      0,
      0,
      2,
      v_mission_id
    ) RETURNING id INTO v_hint_card_id;

    IF v_mission_id IS NOT NULL THEN
      INSERT INTO public.card_hints (card_id, mission_id, level, hint_text, is_active)
      VALUES (
        v_hint_card_id,
        v_mission_id,
        2,
        'Starter combined hint: pair the mission objective with the current board state.',
        true
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'Mandatory Signal') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value, image_url,
      is_mandatory, is_exclusive, hint_content, combine_group_id,
      combine_result_content, sort_order, shop_price, shop_visible,
      shop_enabled, effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id
    ) VALUES (
      'Mandatory Signal',
      'A mandatory card that stays visible in the shop and book.',
      'mandatory',
      'legendary',
      0,
      NULL,
      true,
      false,
      NULL,
      NULL,
      NULL,
      8,
      150,
      true,
      true,
      0,
      0,
      1,
      NULL
    );
  END IF;
END $$;