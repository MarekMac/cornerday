-- Fix: trigger functions need SECURITY DEFINER so they run as the DB owner
-- and can UPDATE community_posts even though authenticated users have no UPDATE policy.

create or replace function update_reactions_count()
returns trigger language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set reactions_count = reactions_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set reactions_count = greatest(0, reactions_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create or replace function update_comments_count()
returns trigger language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set comments_count = comments_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set comments_count = greatest(0, comments_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

-- Backfill counts for any posts that already have comments/reactions
update community_posts p
set
  comments_count  = (select count(*) from community_comments  c where c.post_id = p.id),
  reactions_count = (select count(*) from community_reactions r where r.post_id = p.id);
