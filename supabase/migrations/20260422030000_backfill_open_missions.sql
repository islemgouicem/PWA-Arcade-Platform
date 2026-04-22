-- Backfill existing missions so visible/enabled missions can actually be joined.

update public.missions
   set
   is_open = true
 where visible = true
   and enabled = true
   and coalesce(
   is_open,
   false
) = false;