
-- Remove existing roles and set superadmin
DELETE FROM public.user_roles WHERE user_id = '214cca21-1d79-467d-8d9c-ec6488d0fbaf';
INSERT INTO public.user_roles (user_id, role) VALUES ('214cca21-1d79-467d-8d9c-ec6488d0fbaf', 'superadmin');

-- Ensure profile is active
UPDATE public.profiles SET status = 'active' WHERE user_id = '214cca21-1d79-467d-8d9c-ec6488d0fbaf';
