import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Verify the calling user via their JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Explicitly delete all user PII — don't rely solely on cascade
    await Promise.all([
      adminClient.from('urge_journal').delete().eq('user_id', user.id),
      adminClient.from('mood_checkins').delete().eq('user_id', user.id),
      adminClient.from('badges').delete().eq('user_id', user.id),
      adminClient.from('losses').delete().eq('user_id', user.id),
      adminClient.from('debt_payments').delete().eq('user_id', user.id),
      adminClient.from('debts').delete().eq('user_id', user.id),
      adminClient.from('streaks').delete().eq('user_id', user.id),
      adminClient.from('game_scores').delete().eq('user_id', user.id),
      adminClient.from('community_posts').delete().eq('user_id', user.id),
      adminClient.from('community_comments').delete().eq('user_id', user.id),
      adminClient.from('community_reactions').delete().eq('user_id', user.id),
      adminClient.from('community_bookmarks').delete().eq('user_id', user.id),
    ]);

    // partner_messages reference partner_links (not users directly) — delete chain
    const { data: links } = await adminClient
      .from('partner_links')
      .select('id')
      .eq('user_id', user.id);
    if (links && links.length > 0) {
      const linkIds = links.map((l: { id: string }) => l.id);
      await adminClient.from('partner_messages').delete().in('link_id', linkIds);
      await adminClient.from('partner_links').delete().eq('user_id', user.id);
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
    }
    await adminClient.from('users').delete().eq('id', user.id);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
