-- Allow post owners to edit their own posts
create policy "update own post"
  on community_posts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow comment owners to edit their own comments
create policy "update own comment"
  on community_comments for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
