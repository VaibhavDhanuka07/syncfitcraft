create table if not exists public.platform_messages (
  id text primary key,
  message text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.platform_messages (id, message)
values ('client_order_banner', '')
on conflict (id) do nothing;

create or replace function public.sync_platform_message_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_platform_message_updated_at on public.platform_messages;
create trigger trg_sync_platform_message_updated_at
before update on public.platform_messages
for each row execute procedure public.sync_platform_message_updated_at();

alter table public.platform_messages enable row level security;

drop policy if exists "platform_messages_select_authenticated" on public.platform_messages;
create policy "platform_messages_select_authenticated" on public.platform_messages
for select
using (auth.uid() is not null);

drop policy if exists "platform_messages_admin_upsert" on public.platform_messages;
create policy "platform_messages_admin_upsert" on public.platform_messages
for insert
with check (public.is_admin());

drop policy if exists "platform_messages_admin_update" on public.platform_messages;
create policy "platform_messages_admin_update" on public.platform_messages
for update
using (public.is_admin())
with check (public.is_admin());

