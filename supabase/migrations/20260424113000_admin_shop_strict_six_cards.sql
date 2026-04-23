-- Normalize admin shop to strict 6-card model:
-- attack, defense, healing, hint_low, hint_mid, hint_high
-- Keep one canonical row per type and hide legacy duplicates.

DO $$
DECLARE
  v_type public.card_type;
BEGIN
  FOR v_type IN
    SELECT unnest(ARRAY['attack', 'defense', 'healing', 'hint_low', 'hint_mid', 'hint_high']::public.card_type[])
  LOOP
    -- Ensure at least one row exists per required type.
    IF NOT EXISTS (SELECT 1 FROM public.cards WHERE card_type = v_type) THEN
      INSERT INTO public.cards (
        name,
        description,
        card_type,
        rarity,
        point_value,
        sort_order,
        shop_price,
        shop_visible,
        shop_enabled,
        reward_enabled,
        effect_percent,
        effect_duration_minutes,
        hint_level
      ) VALUES (
        CASE v_type
          WHEN 'attack' THEN 'ARCADE - Attack'
          WHEN 'defense' THEN 'ARCADE - Defense'
          WHEN 'healing' THEN 'ARCADE - Healing'
          WHEN 'hint_low' THEN 'ARCADE - Hint Low'
          WHEN 'hint_mid' THEN 'ARCADE - Hint Mid'
          ELSE 'ARCADE - Hint High'
        END,
        CASE v_type
          WHEN 'attack' THEN 'Single attack card type.'
          WHEN 'defense' THEN 'Single defense card type.'
          WHEN 'healing' THEN 'Single healing card type.'
          WHEN 'hint_low' THEN 'Low-tier mission hint card.'
          WHEN 'hint_mid' THEN 'Mid-tier mission hint card.'
          ELSE 'High-tier mission hint card.'
        END,
        v_type,
        CASE
          WHEN v_type IN ('hint_high') THEN 'epic'::public.card_rarity
          WHEN v_type IN ('hint_mid') THEN 'rare'::public.card_rarity
          ELSE 'ordinary'::public.card_rarity
        END,
        0,
        CASE v_type
          WHEN 'hint_low' THEN 101
          WHEN 'hint_mid' THEN 102
          WHEN 'hint_high' THEN 103
          WHEN 'healing' THEN 201
          WHEN 'attack' THEN 301
          ELSE 401
        END,
        50,
        true,
        true,
        CASE WHEN v_type IN ('hint_low', 'hint_mid', 'hint_high') THEN false ELSE true END,
        CASE WHEN v_type IN ('attack', 'healing') THEN 10 ELSE 0 END,
        CASE WHEN v_type = 'defense' THEN 5 ELSE 0 END,
        CASE
          WHEN v_type = 'hint_low' THEN 1
          WHEN v_type = 'hint_mid' THEN 2
          WHEN v_type = 'hint_high' THEN 3
          ELSE 1
        END
      );
    END IF;
  END LOOP;
END $$;

WITH ranked AS (
  SELECT
    id,
    card_type,
    ROW_NUMBER() OVER (PARTITION BY card_type ORDER BY sort_order NULLS LAST, created_at ASC) AS rn
  FROM public.cards
  WHERE card_type IN ('attack', 'defense', 'healing', 'hint_low', 'hint_mid', 'hint_high')
)
UPDATE public.cards c
SET
  shop_visible = CASE WHEN r.rn = 1 THEN c.shop_visible ELSE false END,
  shop_enabled = CASE WHEN r.rn = 1 THEN true ELSE false END,
  reward_enabled = CASE
    WHEN c.card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN false
    WHEN r.rn = 1 THEN COALESCE(c.reward_enabled, true)
    ELSE false
  END,
  linked_mission_id = CASE
    WHEN c.card_type IN ('hint_low', 'hint_mid', 'hint_high') THEN NULL
    ELSE c.linked_mission_id
  END,
  sort_order = CASE
    WHEN r.rn = 1 THEN
      CASE c.card_type
        WHEN 'hint_low' THEN 101
        WHEN 'hint_mid' THEN 102
        WHEN 'hint_high' THEN 103
        WHEN 'healing' THEN 201
        WHEN 'attack' THEN 301
        ELSE 401
      END
    ELSE c.sort_order
  END
FROM ranked r
WHERE c.id = r.id;
