-- Business registration profile fields
alter table public.profiles add column if not exists firm_name text;
alter table public.profiles add column if not exists proprietor_name text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists gst_number text;
alter table public.profiles add column if not exists firm_address text;
alter table public.profiles add column if not exists phone1 text;
alter table public.profiles add column if not exists phone2 text;
alter table public.profiles add column if not exists email2 text;
alter table public.profiles add column if not exists approval_status text;

update public.profiles
set
  firm_name = coalesce(nullif(firm_name, ''), coalesce(name, split_part(email, '@', 1))),
  proprietor_name = coalesce(nullif(proprietor_name, ''), coalesce(name, split_part(email, '@', 1))),
  full_name = coalesce(nullif(full_name, ''), coalesce(name, split_part(email, '@', 1))),
  gst_number = coalesce(gst_number, ''),
  firm_address = coalesce(firm_address, ''),
  phone1 = coalesce(phone1, ''),
  approval_status = coalesce(
    approval_status,
    case
      when status in ('approved', 'pending', 'rejected') then status
      else 'approved'
    end
  );

alter table public.profiles alter column firm_name set not null;
alter table public.profiles alter column proprietor_name set not null;
alter table public.profiles alter column full_name set not null;
alter table public.profiles alter column gst_number set not null;
alter table public.profiles alter column firm_address set not null;
alter table public.profiles alter column phone1 set not null;
alter table public.profiles alter column approval_status set not null;

alter table public.profiles alter column approval_status set default 'pending';

alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles
  add constraint profiles_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create unique index if not exists idx_profiles_gst_unique
on public.profiles (upper(gst_number))
where gst_number <> '';

-- Ensure auth trigger keeps new users in pending review
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    name,
    email,
    role,
    status,
    approval_status,
    firm_name,
    proprietor_name,
    full_name,
    gst_number,
    firm_address,
    phone1,
    phone2,
    email2
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'client',
    'pending',
    'pending',
    coalesce(new.raw_user_meta_data ->> 'firm_name', ''),
    coalesce(new.raw_user_meta_data ->> 'proprietor_name', ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'gst_number', ''),
    coalesce(new.raw_user_meta_data ->> 'firm_address', ''),
    coalesce(new.raw_user_meta_data ->> 'phone1', ''),
    nullif(new.raw_user_meta_data ->> 'phone2', ''),
    nullif(new.raw_user_meta_data ->> 'email2', '')
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  return new;
end;
$$;

-- Special request message box
create table if not exists public.special_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  reply text,
  status text not null default 'new' check (status in ('new', 'seen', 'responded')),
  created_at timestamptz not null default now()
);

create index if not exists idx_special_requests_status on public.special_requests(status);
create index if not exists idx_special_requests_created_at on public.special_requests(created_at desc);

alter table public.special_requests enable row level security;

drop policy if exists "special_requests_client_insert" on public.special_requests;
create policy "special_requests_client_insert" on public.special_requests
for insert
with check (auth.uid() = user_id);

drop policy if exists "special_requests_client_select_own" on public.special_requests;
create policy "special_requests_client_select_own" on public.special_requests
for select
using (auth.uid() = user_id);

drop policy if exists "special_requests_admin_select_all" on public.special_requests;
create policy "special_requests_admin_select_all" on public.special_requests
for select
using (public.is_admin());

drop policy if exists "special_requests_admin_update" on public.special_requests;
create policy "special_requests_admin_update" on public.special_requests
for update
using (public.is_admin())
with check (public.is_admin());
