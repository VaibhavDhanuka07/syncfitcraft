create extension if not exists pgcrypto;

-- Products: add type + pricing + stock control fields.
alter table public.products add column if not exists type text;
alter table public.products add column if not exists price numeric(12,2) default 0;
alter table public.products add column if not exists discount numeric(5,2) default 0;
alter table public.products add column if not exists stock integer;
alter table public.products add column if not exists is_active boolean default true;
alter table public.products add column if not exists low_stock_threshold integer default 10;
alter table public.products add column if not exists image_url text;

update public.products
set type = coalesce(type, 'GY');

update public.products
set stock = coalesce(stock, available_reels, 0);

update public.products
set available_reels = coalesce(available_reels, stock, 0);

alter table public.products alter column type set not null;
alter table public.products alter column type set default 'GY';
alter table public.products alter column stock set not null;
alter table public.products alter column is_active set not null;
alter table public.products alter column low_stock_threshold set not null;
alter table public.products alter column price set not null;
alter table public.products alter column discount set not null;

alter table public.products drop constraint if exists products_type_check;
alter table public.products add constraint products_type_check check (type in ('GY', 'NS'));
alter table public.products drop constraint if exists products_gsm_bf_inch_type_unique;
alter table public.products drop constraint if exists products_gsm_bf_inch_key;
alter table public.products add constraint products_gsm_bf_inch_type_unique unique (gsm, bf, inch, type);
alter table public.products drop constraint if exists products_stock_non_negative;
alter table public.products add constraint products_stock_non_negative check (stock >= 0);
alter table public.products drop constraint if exists products_discount_non_negative;
alter table public.products add constraint products_discount_non_negative check (discount >= 0);
alter table public.products drop constraint if exists products_price_non_negative;
alter table public.products add constraint products_price_non_negative check (price >= 0);
alter table public.products drop constraint if exists products_low_stock_threshold_non_negative;
alter table public.products add constraint products_low_stock_threshold_non_negative check (low_stock_threshold >= 0);

create index if not exists idx_products_stock on public.products(stock);
grant delete on public.products to authenticated;
drop policy if exists "products_admin_delete" on public.products;
create policy "products_admin_delete" on public.products
for delete
using (public.is_admin());

-- Orders/item statuses: add accepted/partial while keeping old values compatible.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending', 'accepted', 'rejected', 'partial', 'approved', 'partially_accepted'));

alter table public.order_items add column if not exists item_status text;
update public.order_items
set item_status = coalesce(
  item_status,
  case
    when status in ('approved', 'accepted') then 'accepted'
    when status = 'rejected' then 'rejected'
    else 'pending'
  end
);
alter table public.order_items alter column item_status set not null;
alter table public.order_items drop constraint if exists order_items_item_status_check;
alter table public.order_items add constraint order_items_item_status_check check (item_status in ('pending', 'accepted', 'rejected'));

create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_date on public.orders(created_at desc);

-- Keep legacy available_reels synchronized with stock.
create or replace function public.sync_product_stock_columns()
returns trigger
language plpgsql
as $$
begin
  if new.stock is null then
    new.stock := coalesce(old.stock, old.available_reels, 0);
  end if;

  new.available_reels := new.stock;
  return new;
end;
$$;

drop trigger if exists trg_sync_product_stock_columns on public.products;
create trigger trg_sync_product_stock_columns
before insert or update of stock, available_reels on public.products
for each row execute procedure public.sync_product_stock_columns();

-- Recalculate orders based on item_status.
create or replace function public.recalculate_order_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count integer;
  accepted_count integer;
  rejected_count integer;
  pending_count integer;
  new_status text;
begin
  select
    count(*),
    count(*) filter (where item_status = 'accepted'),
    count(*) filter (where item_status = 'rejected'),
    count(*) filter (where item_status = 'pending')
  into total_count, accepted_count, rejected_count, pending_count
  from public.order_items
  where order_id = p_order_id;

  if total_count = 0 then
    new_status := 'pending';
  elsif pending_count > 0 then
    new_status := 'pending';
  elsif accepted_count = total_count then
    new_status := 'accepted';
  elsif rejected_count = total_count then
    new_status := 'rejected';
  else
    new_status := 'partial';
  end if;

  update public.orders
  set status = new_status
  where id = p_order_id;
end;
$$;

-- New item decision function (accept/reject); stock deducted only for accepted.
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
  v_decision text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can process order items';
  end if;

  v_decision := lower(p_decision);
  if v_decision = 'approved' then
    v_decision := 'accepted';
  end if;

  if v_decision not in ('accepted', 'rejected') then
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

  if v_item.item_status <> 'pending' then
    raise exception 'Order item already processed';
  end if;

  if v_decision = 'rejected' then
    v_qty := 0;
  else
    v_qty := coalesce(p_quantity_approved, v_item.quantity_requested);
    if v_qty <= 0 or v_qty > v_item.quantity_requested then
      raise exception 'Approved qty must be between 1 and requested';
    end if;

    select stock
    into v_stock
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
    set stock = stock - v_qty,
        available_reels = stock - v_qty
    where id = v_item.product_id;
  end if;

  update public.order_items
  set
    quantity_approved = v_qty,
    item_status = v_decision,
    status = case when v_decision = 'accepted' and v_qty < quantity_requested then 'partially_accepted' when v_decision = 'accepted' then 'approved' else 'rejected' end,
    updated_at = now()
  where id = p_order_item_id;

  perform public.recalculate_order_status(v_item.order_id);

  return query
  select v_item.order_id, v_decision, v_qty;
end;
$$;

-- New order creation that includes product type.
create or replace function public.create_order_with_item_v2(
  p_gsm integer,
  p_bf integer,
  p_inch integer,
  p_type text,
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

  if p_type not in ('GY', 'NS') then
    raise exception 'Invalid product type';
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
  where gsm = p_gsm and bf = p_bf and inch = p_inch and type = p_type and is_active = true;

  if v_product_id is null then
    raise exception 'Product combination not found';
  end if;

  insert into public.orders (user_id, gsm, bf, inch, quantity, status)
  values (auth.uid(), p_gsm, p_bf, p_inch, p_quantity, 'pending')
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity_requested, quantity_approved, status, item_status)
  values (v_order_id, v_product_id, p_quantity, 0, 'pending', 'pending');

  return v_order_id;
end;
$$;

-- Bulk update helpers for transactional imports.
create or replace function public.admin_bulk_update_stock(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  v_updated integer := 0;
  v_errors integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  for rec in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    begin
      update public.products
      set stock = coalesce((rec->>'stock')::integer, stock),
          available_reels = coalesce((rec->>'stock')::integer, available_reels)
      where id = (rec->>'product_id')::uuid;

      if found then
        v_updated := v_updated + 1;
      else
        v_errors := v_errors + 1;
      end if;
    exception when others then
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object('updated', v_updated, 'errors', v_errors);
end;
$$;

create or replace function public.admin_bulk_update_orders(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  v_updated integer := 0;
  v_errors integer := 0;
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  for rec in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    begin
      v_status := lower(coalesce(rec->>'status', ''));
      if v_status = 'approved' then v_status := 'accepted'; end if;
      if v_status = 'partially_accepted' then v_status := 'partial'; end if;

      if v_status not in ('pending', 'accepted', 'rejected', 'partial') then
        v_errors := v_errors + 1;
        continue;
      end if;

      update public.orders
      set status = v_status
      where id = (rec->>'order_id')::uuid;

      if found then
        v_updated := v_updated + 1;
      else
        v_errors := v_errors + 1;
      end if;
    exception when others then
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object('updated', v_updated, 'errors', v_errors);
end;
$$;

grant execute on function public.create_order_with_item_v2(integer, integer, integer, text, integer) to authenticated;
grant execute on function public.admin_bulk_update_stock(jsonb) to authenticated;
grant execute on function public.admin_bulk_update_orders(jsonb) to authenticated;
