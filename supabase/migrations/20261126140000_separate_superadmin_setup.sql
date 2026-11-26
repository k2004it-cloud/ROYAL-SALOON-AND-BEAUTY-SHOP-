-- The previous migration incorrectly assigned Superadmin to the salon's first
-- Admin. Restore distinct account ownership; Superadmin is never inferred from
-- salon account order.
update public.users
set is_superadmin = 0
where role = 'admin' and is_superadmin = 1;
