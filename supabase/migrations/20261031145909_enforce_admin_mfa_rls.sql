-- Match the application's step-up rule at the database boundary. An admin who
-- has a verified factor must use an AAL2 session for RLS-protected data and
-- SECURITY DEFINER admin functions, even when accessing Supabase directly.
-- Accounts without a verified factor can still sign in and enroll one.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) and (
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;
