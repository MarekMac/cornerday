-- Community posts
create table community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  content text not null,
  tag text,
  reactions_count int not null default 0,
  comments_count int not null default 0,
  reports_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Community comments
create table community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Reactions (one per user per post)
create table community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

-- Reports
create table community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reporter_id uuid references users(id) on delete cascade not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Trigger: keep reactions_count in sync
create or replace function update_reactions_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set reactions_count = reactions_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set reactions_count = greatest(0, reactions_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_reactions_count
after insert or delete on community_reactions
for each row execute function update_reactions_count();

-- Trigger: keep comments_count in sync
create or replace function update_comments_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set comments_count = comments_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set comments_count = greatest(0, comments_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_comments_count
after insert or delete on community_comments
for each row execute function update_comments_count();

-- RLS
alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table community_reactions enable row level security;
alter table community_reports enable row level security;

create policy "read posts"         on community_posts for select to authenticated using (true);
create policy "insert own post"    on community_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "delete own post"    on community_posts for delete to authenticated using (auth.uid() = user_id);

create policy "read comments"      on community_comments for select to authenticated using (true);
create policy "insert own comment" on community_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "delete own comment" on community_comments for delete to authenticated using (auth.uid() = user_id);

create policy "read reactions"     on community_reactions for select to authenticated using (true);
create policy "insert reaction"    on community_reactions for insert to authenticated with check (auth.uid() = user_id);
create policy "delete reaction"    on community_reactions for delete to authenticated using (auth.uid() = user_id);

create policy "insert report"      on community_reports for insert to authenticated with check (auth.uid() = reporter_id);
