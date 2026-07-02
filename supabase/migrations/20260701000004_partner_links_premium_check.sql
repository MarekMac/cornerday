-- "Someone in your corner" (trusted supporter) is a premium feature, but
-- generateAndShare() (account.tsx) only INSERTs into partner_links directly
-- via the Supabase client with a user_id check — the premium gate was purely
-- a UI branch hiding the button for non-premium users. Any client bypassing
-- the app's UI (e.g. a modified build calling the REST API with a valid JWT)
-- could create a fully-functional partner link with no entitlement check at
-- any layer.
--
-- Split the previous single FOR ALL policy into per-command policies: reads/
-- updates/deletes stay unrestricted for the owner (revoking or managing an
-- existing link should never be blocked, even if premium later lapses), but
-- creating a NEW link now requires live premium (or admin) status.
DROP POLICY IF EXISTS partner_links_owner ON partner_links;

CREATE POLICY partner_links_select ON partner_links
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY partner_links_insert ON partner_links
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (is_premium = true OR is_admin = true))
  );

CREATE POLICY partner_links_update ON partner_links
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY partner_links_delete ON partner_links
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
