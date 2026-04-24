-- Assign default card artwork for the six supported card types.
-- Images live under /public/ and are served from the site root.

UPDATE public.cards SET image_url = '/attack.png'   WHERE card_type = 'attack';
UPDATE public.cards SET image_url = '/defend.png'   WHERE card_type = 'defense';
UPDATE public.cards SET image_url = '/heal.png'     WHERE card_type = 'healing';
UPDATE public.cards SET image_url = '/hintlow.png'  WHERE card_type = 'hint_low';
UPDATE public.cards SET image_url = '/hintmid.png'  WHERE card_type = 'hint_mid';
UPDATE public.cards SET image_url = '/hinthigh.png' WHERE card_type = 'hint_high';
