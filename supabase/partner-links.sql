-- Accountability partner tables
-- Run this in the Supabase SQL editor

create table partner_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(8), 'hex'),
  created_at timestamptz default now()
);

create table partner_messages (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references partner_links(id) on delete cascade,
  message    text not null,
  read_at    timestamptz,
  created_at timestamptz default now()
);

alter table partner_links    enable row level security;
alter table partner_messages enable row level security;

-- Link owner controls their own link
create policy "partner_links_owner" on partner_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Link owner can read and mark messages as read; inserts bypass RLS via Edge Function service role
create policy "partner_messages_select" on partner_messages
  for select using (
    exists (select 1 from partner_links pl where pl.id = link_id and pl.user_id = auth.uid())
  );

create policy "partner_messages_update" on partner_messages
  for update using (
    exists (select 1 from partner_links pl where pl.id = link_id and pl.user_id = auth.uid())
  );
