alter table public.order_items
  add column if not exists requested_gsm integer,
  add column if not exists requested_bf integer,
  add column if not exists requested_inch integer,
  add column if not exists requested_type text;

update public.order_items oi
set
  requested_gsm = coalesce(oi.requested_gsm, o.gsm, p.gsm),
  requested_bf = coalesce(oi.requested_bf, o.bf, p.bf),
  requested_inch = coalesce(oi.requested_inch, o.inch, p.inch),
  requested_type = coalesce(oi.requested_type, p.type)
from public.orders o, public.products p
where o.id = oi.order_id
  and p.id = oi.product_id
  and (
    oi.requested_gsm is null
    or oi.requested_bf is null
    or oi.requested_inch is null
    or oi.requested_type is null
  );

alter table public.order_items
  alter column requested_gsm set not null,
  alter column requested_bf set not null,
  alter column requested_inch set not null,
  alter column requested_type set not null;

alter table public.order_items drop constraint if exists order_items_requested_gsm_check;
alter table public.order_items drop constraint if exists order_items_requested_bf_check;
alter table public.order_items drop constraint if exists order_items_requested_inch_check;
alter table public.order_items drop constraint if exists order_items_requested_type_check;

alter table public.order_items
  add constraint order_items_requested_gsm_check check (requested_gsm between 60 and 400 and requested_gsm % 10 = 0),
  add constraint order_items_requested_bf_check check (requested_bf in (16,18,20,22,24,25,26,28,30,32,34,36,38,40)),
  add constraint order_items_requested_inch_check check (requested_inch between 10 and 60),
  add constraint order_items_requested_type_check check (requested_type in ('GY', 'NS'));

create or replace function public.create_order_with_items_v3(p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  v_order_id uuid;
  v_product_id uuid;
  v_gsm integer;
  v_bf integer;
  v_inch integer;
  v_quantity integer;
  v_type text;
  v_total_quantity integer := 0;
  v_index integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if coalesce(jsonb_typeof(p_rows), 'null') <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No order items provided';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
  ) then
    raise exception 'Account pending approval';
  end if;

  for rec in select * from jsonb_array_elements(p_rows)
  loop
    v_index := v_index + 1;

    begin
      v_gsm := (rec->>'gsm')::integer;
      v_bf := (rec->>'bf')::integer;
      v_inch := (rec->>'inch')::integer;
      v_quantity := (rec->>'quantity')::integer;
      v_type := upper(trim(coalesce(rec->>'type', '')));
    exception when others then
      raise exception 'Item %: Invalid product specification', v_index;
    end;

    if v_gsm not between 60 and 400 or v_gsm % 10 <> 0 then
      raise exception 'Item %: Invalid GSM', v_index;
    end if;

    if v_bf not in (16,18,20,22,24,25,26,28,30,32,34,36,38,40) then
      raise exception 'Item %: Invalid BF', v_index;
    end if;

    if v_inch not between 10 and 60 then
      raise exception 'Item %: Invalid Inch', v_index;
    end if;

    if v_quantity <= 0 then
      raise exception 'Item %: Quantity must be positive', v_index;
    end if;

    if v_type not in ('GY', 'NS') then
      raise exception 'Item %: Invalid product type', v_index;
    end if;

    select id
    into v_product_id
    from public.products
    where gsm = v_gsm
      and bf = v_bf
      and inch = v_inch
      and type = v_type
      and is_active = true;

    if v_product_id is null then
      raise exception 'Item %: Product combination not found', v_index;
    end if;

    if v_order_id is null then
      insert into public.orders (user_id, gsm, bf, inch, quantity, status)
      values (auth.uid(), v_gsm, v_bf, v_inch, v_quantity, 'pending')
      returning id into v_order_id;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      quantity_requested,
      quantity_approved,
      status,
      item_status,
      requested_gsm,
      requested_bf,
      requested_inch,
      requested_type
    )
    values (
      v_order_id,
      v_product_id,
      v_quantity,
      0,
      'pending',
      'pending',
      v_gsm,
      v_bf,
      v_inch,
      v_type
    );

    v_total_quantity := v_total_quantity + v_quantity;
  end loop;

  update public.orders
  set quantity = v_total_quantity
  where id = v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_order_with_items_v3(jsonb) to authenticated;
