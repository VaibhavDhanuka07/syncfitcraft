create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text not null unique,
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  gsm integer not null check (gsm between 60 and 400 and gsm % 10 = 0),
  bf integer not null check (bf in (16,18,20,22,24,25,26,28,30,32,34,36,38,40)),
  inch integer not null check (inch between 10 and 60),
  available_reels integer not null default 0 check (available_reels >= 0),
  created_at timestamptz not null default now(),
  unique (gsm, bf, inch)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  gsm integer not null,
  bf integer not null,
  inch integer not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_products_combo on public.products (gsm, bf, inch);
create index if not exists idx_orders_user_created_at on public.orders (user_id, created_at desc);
create index if not exists idx_orders_status_created_at on public.orders (status, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'client'
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.validate_order_product_exists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_exists boolean;
begin
  select exists (
    select 1
    from public.products p
    where p.gsm = new.gsm and p.bf = new.bf and p.inch = new.inch
  ) into product_exists;

  if not product_exists then
    raise exception 'Product combination not found';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_order_product_exists on public.orders;
create trigger trg_validate_order_product_exists
before insert on public.orders
for each row execute procedure public.validate_order_product_exists();

create or replace function public.apply_stock_deduction_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stock integer;
begin
  if old.status = 'approved' and new.status <> 'approved' then
    raise exception 'Approved orders cannot be changed';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    select p.available_reels
    into current_stock
    from public.products p
    where p.gsm = new.gsm and p.bf = new.bf and p.inch = new.inch
    for update;

    if current_stock is null then
      raise exception 'Product combination not found';
    end if;

    if current_stock < new.quantity then
      raise exception 'Insufficient stock';
    end if;

    update public.products p
    set available_reels = p.available_reels - new.quantity
    where p.gsm = new.gsm and p.bf = new.bf and p.inch = new.inch;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_stock_deduction_on_approval on public.orders;
create trigger trg_apply_stock_deduction_on_approval
before update of status on public.orders
for each row execute procedure public.apply_stock_deduction_on_approval();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

create policy "profiles_select_own" on public.profiles
for select
using (id = auth.uid());

create policy "profiles_admin_select_all" on public.profiles
for select
using (public.is_admin());

create policy "profiles_admin_update_all" on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

create policy "products_select_authenticated" on public.products
for select
using (auth.uid() is not null);

create policy "products_admin_insert" on public.products
for insert
with check (public.is_admin());

create policy "products_admin_update" on public.products
for update
using (public.is_admin())
with check (public.is_admin());

create policy "orders_client_insert_own_pending" on public.orders
for insert
with check (
  auth.uid() = user_id
  and status = 'pending'
);

create policy "orders_client_select_own" on public.orders
for select
using (auth.uid() = user_id);

create policy "orders_admin_select_all" on public.orders
for select
using (public.is_admin());

create policy "orders_admin_update_status" on public.orders
for update
using (public.is_admin())
with check (public.is_admin());

revoke delete on public.profiles from anon, authenticated;
revoke delete on public.products from anon, authenticated;
revoke delete on public.orders from anon, authenticated;
