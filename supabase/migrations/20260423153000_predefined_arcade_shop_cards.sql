-- Predefined ARCADE shop catalog: 4 card types × 3 tiers (Low/Medium/High) at 30/50/100 points.
-- Idempotent: inserts missing catalog rows; hides legacy shop cards in the same type family.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS shop_price INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shop_visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shop_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS effect_percent NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effect_duration_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hint_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_mission_id UUID REFERENCES public.missions(id);

DO $$
DECLARE
  v_mission RECORD;
  v_hint_low UUID;
  v_hint_medium UUID;
  v_hint_high UUID;
BEGIN
  -- Hint (Low / Medium / High): hint_level matches tier depth for activation.
  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Hint (Low)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id, reward_enabled
    ) VALUES (
      'ARCADE — Hint (Low)',
      'Predefined hint card (low tier). Price: 30 pts.',
      'hint_single', 'ordinary', 0,
      false, false, 101,
      30, true, true,
      0, 0, 1,
      NULL, false
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Hint (Medium)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id, reward_enabled
    ) VALUES (
      'ARCADE — Hint (Medium)',
      'Predefined hint card (medium tier). Price: 50 pts.',
      'hint_single', 'rare', 0,
      false, false, 102,
      50, true, true,
      0, 0, 2,
      NULL, false
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Hint (High)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      linked_mission_id, reward_enabled
    ) VALUES (
      'ARCADE — Hint (High)',
      'Predefined hint card (high tier). Price: 100 pts.',
      'hint_single', 'epic', 0,
      false, false, 103,
      100, true, true,
      0, 0, 3,
      NULL, false
    );
  END IF;

  -- Healing (recovery)
  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Healing (Low)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Healing (Low)',
      'Predefined healing card (low tier). Price: 30 pts.',
      'recovery', 'ordinary', 0,
      false, false, 201,
      30, true, true,
      8, 0, 1,
      true
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Healing (Medium)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Healing (Medium)',
      'Predefined healing card (medium tier). Price: 50 pts.',
      'recovery', 'rare', 0,
      false, false, 202,
      50, true, true,
      12, 0, 1,
      true
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Healing (High)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Healing (High)',
      'Predefined healing card (high tier). Price: 100 pts.',
      'recovery', 'epic', 0,
      false, false, 203,
      100, true, true,
      18, 0, 1,
      true
    );
  END IF;

  -- Attack (manipulation)
  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Attack (Low)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Attack (Low)',
      'Predefined attack card (low tier). Price: 30 pts.',
      'manipulation', 'ordinary', 0,
      false, false, 301,
      30, true, true,
      6, 0, 1,
      true
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Attack (Medium)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Attack (Medium)',
      'Predefined attack card (medium tier). Price: 50 pts.',
      'manipulation', 'rare', 0,
      false, false, 302,
      50, true, true,
      10, 0, 1,
      true
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Attack (High)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Attack (High)',
      'Predefined attack card (high tier). Price: 100 pts.',
      'manipulation', 'epic', 0,
      false, false, 303,
      100, true, true,
      15, 0, 1,
      true
    );
  END IF;

  -- Defense (protection)
  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Defense (Low)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Defense (Low)',
      'Predefined defense card (low tier). Price: 30 pts.',
      'protection', 'ordinary', 0,
      false, false, 401,
      30, true, true,
      0, 10, 1,
      true
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Defense (Medium)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Defense (Medium)',
      'Predefined defense card (medium tier). Price: 50 pts.',
      'protection', 'rare', 0,
      false, false, 402,
      50, true, true,
      0, 20, 1,
      true
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cards WHERE name = 'ARCADE — Defense (High)') THEN
    INSERT INTO public.cards (
      name, description, card_type, rarity, point_value,
      is_mandatory, is_exclusive, sort_order,
      shop_price, shop_visible, shop_enabled,
      effect_percent, effect_duration_minutes, hint_level,
      reward_enabled
    ) VALUES (
      'ARCADE — Defense (High)',
      'Predefined defense card (high tier). Price: 100 pts.',
      'protection', 'epic', 0,
      false, false, 403,
      100, true, true,
      0, 35, 1,
      true
    );
  END IF;

  -- Normalize catalog rows (prices / tiers) if they already existed with older defaults.
  UPDATE public.cards SET sort_order = 101, shop_price = 30, hint_level = 1, reward_enabled = false
  WHERE name = 'ARCADE — Hint (Low)';
  UPDATE public.cards SET sort_order = 102, shop_price = 50, hint_level = 2, reward_enabled = false
  WHERE name = 'ARCADE — Hint (Medium)';
  UPDATE public.cards SET sort_order = 103, shop_price = 100, hint_level = 3, reward_enabled = false
  WHERE name = 'ARCADE — Hint (High)';

  UPDATE public.cards SET sort_order = 201, shop_price = 30 WHERE name = 'ARCADE — Healing (Low)';
  UPDATE public.cards SET sort_order = 202, shop_price = 50 WHERE name = 'ARCADE — Healing (Medium)';
  UPDATE public.cards SET sort_order = 203, shop_price = 100 WHERE name = 'ARCADE — Healing (High)';

  UPDATE public.cards SET sort_order = 301, shop_price = 30 WHERE name = 'ARCADE — Attack (Low)';
  UPDATE public.cards SET sort_order = 302, shop_price = 50 WHERE name = 'ARCADE — Attack (Medium)';
  UPDATE public.cards SET sort_order = 303, shop_price = 100 WHERE name = 'ARCADE — Attack (High)';

  UPDATE public.cards SET sort_order = 401, shop_price = 30 WHERE name = 'ARCADE — Defense (Low)';
  UPDATE public.cards SET sort_order = 402, shop_price = 50 WHERE name = 'ARCADE — Defense (Medium)';
  UPDATE public.cards SET sort_order = 403, shop_price = 100 WHERE name = 'ARCADE — Defense (High)';

  -- Hide legacy shop cards (same public types) outside the canonical sort_order band.
  UPDATE public.cards
  SET shop_visible = false,
      shop_enabled = false
  WHERE card_type IN ('hint_single', 'recovery', 'manipulation', 'protection')
    AND name NOT LIKE 'ARCADE — %'
    AND (sort_order IS NULL OR sort_order < 101 OR sort_order > 403);

  SELECT id INTO v_hint_low FROM public.cards WHERE name = 'ARCADE — Hint (Low)' LIMIT 1;
  SELECT id INTO v_hint_medium FROM public.cards WHERE name = 'ARCADE — Hint (Medium)' LIMIT 1;
  SELECT id INTO v_hint_high FROM public.cards WHERE name = 'ARCADE — Hint (High)' LIMIT 1;

  -- Starter hints for each static mission (1..6) so hint cards work out of the box.
  FOR v_mission IN
    SELECT id, name, sequence_number
    FROM public.missions
    WHERE sequence_number BETWEEN 1 AND 6
  LOOP
    IF v_hint_low IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.card_hints h
      WHERE h.card_id = v_hint_low AND h.mission_id = v_mission.id AND h.level = 1
    ) THEN
      INSERT INTO public.card_hints (card_id, mission_id, level, hint_text, is_active)
      VALUES (
        v_hint_low,
        v_mission.id,
        1,
        format('[%s] Hint (Low): Check the mission briefing and team roles.', v_mission.name),
        true
      );
    END IF;

    IF v_hint_medium IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.card_hints h
      WHERE h.card_id = v_hint_medium AND h.mission_id = v_mission.id AND h.level = 2
    ) THEN
      INSERT INTO public.card_hints (card_id, mission_id, level, hint_text, is_active)
      VALUES (
        v_hint_medium,
        v_mission.id,
        2,
        format('[%s] Hint (Medium): Re-read objectives and any zone or password rules.', v_mission.name),
        true
      );
    END IF;

    IF v_hint_high IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.card_hints h
      WHERE h.card_id = v_hint_high AND h.mission_id = v_mission.id AND h.level = 3
    ) THEN
      INSERT INTO public.card_hints (card_id, mission_id, level, hint_text, is_active)
      VALUES (
        v_hint_high,
        v_mission.id,
        3,
        format('[%s] Hint (High): Cross-check mission state, timers, and team inventory.', v_mission.name),
        true
      );
    END IF;
  END LOOP;
END $$;
