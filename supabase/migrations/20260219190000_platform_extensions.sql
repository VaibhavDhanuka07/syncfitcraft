create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists status text;

update public.profiles
set status = coalesce(status, 'approved')
where status is null;

alter table public.profiles
  alter column status set default 'pending';

alter table public.profiles
  alter column status set not null;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role in (%admin%client%)%';

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end
$$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'client'));

alter table public.profiles
  add constraint profiles_status_check check (status in ('pending', 'approved', 'rejected'));

-- Extend orders status for partial acceptance.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'orders'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status in (%pending%approved%rejected%)%';

  if constraint_name is not null then
    execute format('alter table public.orders drop constraint %I', constraint_name);
  end if;
end
$$;

alter table public.orders
  add constraint orders_status_check check (status in ('pending', 'approved', 'rejected', 'partially_accepted'));

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity_requested integer not null check (quantity_requested > 0),
  quantity_approved integer not null default 0 check (quantity_approved >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'partially_accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_order_items_product_id on public.order_items (product_id);
create index if not exists idx_order_items_order_id on public.order_items (order_id);

-- Backfill legacy single-line orders into order_items if missing.
insert into public.order_items (order_id, product_id, quantity_requested, quantity_approved, status, created_at, updated_at)
select
  o.id,
  p.id,
  o.quantity,
  case when o.status = 'approved' then o.quantity else 0 end,
  case
    when o.status in ('approved', 'rejected', 'pending', 'partially_accepted') then o.status
    else 'pending'
  end,
  o.created_at,
  now()
from public.orders o
join public.products p
  on p.gsm = o.gsm and p.bf = o.bf and p.inch = o.inch
left join public.order_items oi on oi.order_id = o.id
where oi.id is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'client',
    'pending'
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email;

  return new;
end;
$$;

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
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'approved'
  );
$$;

create or replace function public.recalculate_order_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count integer;
  approved_count integer;
  rejected_count integer;
  partial_count integer;
  pending_count integer;
  new_status text;
begin
  select
    count(*),
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'partially_accepted'),
    count(*) filter (where status = 'pending')
  into total_count, approved_count, rejected_count, partial_count, pending_count
  from public.order_items
  where order_id = p_order_id;

  if total_count = 0 then
    new_status := 'pending';
  elsif pending_count > 0 then
    new_status := 'pending';
  elsif approved_count = total_count then
    new_status := 'approved';
  elsif rejected_count = total_count then
    new_status := 'rejected';
  else
    new_status := 'partially_accepted';
  end if;

  update public.orders
  set status = new_status
  where id = p_order_id;
end;
$$;

create or replace function public.process_order_item_decision(
  p_order_item_id uuid,
  p_decision text,
  p_quantity_approved integer default null
)
returns table(order_id uuid, item_status text, approved_qty integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.order_items%rowtype;
  v_stock integer;
  v_qty integer;
begin
  if not public.is_admin() then
    raise exception 'Only admin can process order items';
  end if;

  if p_decision not in ('approved', 'rejected', 'partially_accepted') then
    raise exception 'Invalid decision';
  end if;

  select *
  into v_item
  from public.order_items
  where id = p_order_item_id
  for update;

  if not found then
    raise exception 'Order item not found';
  end if;

  if v_item.status <> 'pending' then
    raise exception 'Order item already processed';
  end if;

  if p_decision = 'rejected' then
    v_qty := 0;
  elsif p_decision = 'approved' then
    v_qty := v_item.quantity_requested;
  else
    v_qty := coalesce(p_quantity_approved, 0);
    if v_qty <= 0 or v_qty >= v_item.quantity_requested then
      raise exception 'For partial approval, approved qty must be between 1 and requested-1';
    end if;
  end if;

  if v_qty > 0 then
    select available_reels into v_stock
    from public.products
    where id = v_item.product_id
    for update;

    if v_stock is null then
      raise exception 'Product not found';
    end if;

    if v_stock < v_qty then
      raise exception 'Insufficient stock';
    end if;

    update public.products
    set available_reels = available_reels - v_qty
    where id = v_item.product_id;
  end if;

  update public.order_items
  set
    quantity_approved = v_qty,
    status = p_decision,
    updated_at = now()
  where id = p_order_item_id;

  perform public.recalculate_order_status(v_item.order_id);

  return query
  select v_item.order_id, p_decision, v_qty;
end;
$$;

-- Legacy order trigger is superseded by item-level atomic processing.
drop trigger if exists trg_apply_stock_deduction_on_approval on public.orders;

create or replace function public.sync_order_item_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_order_item_updated_at on public.order_items;
create trigger trg_sync_order_item_updated_at
before update on public.order_items
for each row execute procedure public.sync_order_item_updated_at();

alter table public.order_items enable row level security;

create policy "order_items_admin_select_all" on public.order_items
for select
using (public.is_admin());

create policy "order_items_client_select_own" on public.order_items
for select
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id and o.user_id = auth.uid()
  )
);

create policy "order_items_admin_update" on public.order_items
for update
using (public.is_admin())
with check (public.is_admin());

create policy "order_items_admin_insert" on public.order_items
for insert
with check (public.is_admin());

-- Require approved profiles for core table access.
drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_approved_users" on public.products
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
  )
);

drop policy if exists "orders_client_insert_own_pending" on public.orders;
create policy "orders_client_insert_own_pending" on public.orders
for insert
with check (
  auth.uid() = user_id
  and status = 'pending'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
  )
);

drop policy if exists "orders_client_select_own" on public.orders;
create policy "orders_client_select_own" on public.orders
for select
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
  )
);

-- Admin can review all profiles to approve/reject users.
drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all" on public.profiles
for select
using (public.is_admin());

-- Create client order + initial item.
create or replace function public.create_order_with_item(
  p_gsm integer,
  p_bf integer,
  p_inch integer,
  p_quantity integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_product_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
  ) then
    raise exception 'Account pending approval';
  end if;

  select id
  into v_product_id
  from public.products
  where gsm = p_gsm and bf = p_bf and inch = p_inch;

  if v_product_id is null then
    raise exception 'Product combination not found';
  end if;

  insert into public.orders (user_id, gsm, bf, inch, quantity, status)
  values (auth.uid(), p_gsm, p_bf, p_inch, p_quantity, 'pending')
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity_requested, quantity_approved, status)
  values (v_order_id, v_product_id, p_quantity, 0, 'pending');

  return v_order_id;
end;
$$;

grant execute on function public.process_order_item_decision(uuid, text, integer) to authenticated;
grant execute on function public.create_order_with_item(integer, integer, integer, integer) to authenticated;
