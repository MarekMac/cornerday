-- Step 1: recreate reactions trigger with SECURITY DEFINER
create or replace function update_reactions_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set reactions_count = reactions_count + 1 where id = NEW.post_id;
  else
    update community_posts set reactions_count = case when reactions_count > 0 then reactions_count - 1 else 0 end where id = OLD.post_id;
  end if;
  return null;
end;
$$;

-- Step 2: recreate comments trigger with SECURITY DEFINER
create or replace function update_comments_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set comments_count = comments_count + 1 where id = NEW.post_id;
  else
    update community_posts set comments_count = case when comments_count > 0 then comments_count - 1 else 0 end where id = OLD.post_id;
  end if;
  return null;
end;
$$;

-- Step 3: backfill existing posts with correct counts
update community_posts p
set
  comments_count  = (select count(*) from community_comments  c where c.post_id = p.id),
  reactions_count = (select count(*) from community_reactions r where r.post_id = p.id);
