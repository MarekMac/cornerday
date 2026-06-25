-- Fix avatar INSERT policy: restrict to paths owned by the uploading user.
-- Client uploads as `{userId}-{timestamp}.ext`, so the path must start with the caller's UUID.
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
CREATE POLICY "avatars_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE (auth.uid()::text || '-%')
  );

-- Fix community_comment_reactions SELECT: scope to authenticated users only.
-- Previously USING (true) with no TO clause, allowing anon-role reads.
DROP POLICY IF EXISTS "comment_reactions_read_all" ON community_comment_reactions;
CREATE POLICY "comment_reactions_read_all"
  ON community_comment_reactions FOR SELECT TO authenticated
  USING (true);
