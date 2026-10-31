begin;
select plan(14);

-- These users and the protected table exist only inside this test transaction.
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('6a9e7110-a961-4b35-97b2-b16dc594450b', 'authenticated', 'authenticated', 'admin-fixture@admin.terasbarber.invalid', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('d3e13a62-975f-4e2b-837a-4083b7ee98d9', 'authenticated', 'authenticated', 'barber-fixture@admin.terasbarber.invalid', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
insert into public.profiles (id, role, full_name) values
  ('6a9e7110-a961-4b35-97b2-b16dc594450b', 'admin', 'Test administrator'),
  ('d3e13a62-975f-4e2b-837a-4083b7ee98d9', 'barber', 'Test barber');
create table public.admin_mfa_test_resource (id integer primary key);
alter table public.admin_mfa_test_resource enable row level security;
revoke all on public.admin_mfa_test_resource from public, anon, authenticated;
grant select on public.admin_mfa_test_resource to authenticated;
create policy "MFA test admin read" on public.admin_mfa_test_resource for select to authenticated using (public.is_admin());
insert into public.admin_mfa_test_resource values (1);

select set_config('request.jwt.claims', '{"sub":"6a9e7110-a961-4b35-97b2-b16dc594450b","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.is_admin(), true, 'an admin without a verified factor can enroll MFA');
select is((select count(*)::integer from public.admin_mfa_test_resource), 1, 'existing admin access works before MFA is enrolled');

reset role;
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values ('4ae87a49-139e-4588-b0d7-1e6d80c61240', '6a9e7110-a961-4b35-97b2-b16dc594450b', 'totp', 'unverified', now(), now());
set local role authenticated;
select is(public.is_admin(), true, 'an unfinished factor does not lock an admin out of enrollment');

reset role;
update auth.mfa_factors set status = 'verified' where id = '4ae87a49-139e-4588-b0d7-1e6d80c61240';
set local role authenticated;
select is(public.is_admin(), false, 'a verified factor requires an AAL2 session');
select is((select count(*)::integer from public.admin_mfa_test_resource), 0, 'direct Supabase reads cannot bypass MFA at AAL1');
select is((select count(*)::integer from public.profiles where id = '6a9e7110-a961-4b35-97b2-b16dc594450b'), 1, 'the admin can read their own profile to complete the MFA challenge');

select set_config('request.jwt.claims', '{"sub":"6a9e7110-a961-4b35-97b2-b16dc594450b","role":"authenticated","aal":"aal2"}', true);
select is(public.is_admin(), true, 'a verified admin with AAL2 can access admin resources');
select is((select count(*)::integer from public.admin_mfa_test_resource), 1, 'RLS permits verified admin access at AAL2');

select set_config('request.jwt.claims', '{"sub":"d3e13a62-975f-4e2b-837a-4083b7ee98d9","role":"authenticated","aal":"aal2"}', true);
select is(public.is_admin(), false, 'AAL2 alone does not grant an ordinary user admin access');
select is((select count(*)::integer from public.admin_mfa_test_resource), 0, 'RLS continues to reject a non-admin at AAL2');

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select is(public.is_admin(), false, 'anonymous clients are not administrators');
select ok(not has_function_privilege('anon', 'public.create_public_booking(uuid,uuid,timestamptz,text,text,text,text)', 'execute'), 'anonymous clients cannot invoke the legacy booking RPC');
select ok(not has_function_privilege('authenticated', 'public.create_public_booking(uuid,uuid,timestamptz,text,text,text,text)', 'execute'), 'authenticated clients cannot invoke the legacy booking RPC');
select ok(has_function_privilege('service_role', 'public.create_public_booking(uuid,uuid,timestamptz,text,text,text,text)', 'execute'), 'the service role retains legacy booking access');

select * from finish();
rollback;
