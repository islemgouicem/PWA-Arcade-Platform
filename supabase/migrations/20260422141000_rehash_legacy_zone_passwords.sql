-- Rehash legacy zone passwords that were stored as base64/plain text.
-- New code paths now hash via crypt_generate; this fixes existing rows.

-- Case 1: password_hash contains base64-encoded plain text (legacy client btoa output)
UPDATE public.mission_zones
SET password_hash = extensions.crypt(
  convert_from(decode(password_hash, 'base64'), 'UTF8'),
  extensions.gen_salt('bf')
),
updated_at = now()
WHERE password_hash IS NOT NULL
  AND password_hash NOT LIKE '$2%'
  AND char_length(password_hash) % 4 = 0
  AND password_hash ~ '^[A-Za-z0-9+/]+={0,2}$';

-- Case 2: any remaining non-bcrypt values are treated as plaintext and hashed directly
UPDATE public.mission_zones
SET password_hash = extensions.crypt(password_hash, extensions.gen_salt('bf')),
    updated_at = now()
WHERE password_hash IS NOT NULL
  AND password_hash NOT LIKE '$2%';
