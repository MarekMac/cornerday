import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://cornerday.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const rawBody = await req.text();
    if (rawBody.length > 65536) {
      return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Verify the calling user via their JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const userId = user.id;

    // Best-effort avatar storage cleanup before deleting anything
    try {
      await adminClient.storage.from('avatars').remove([
        userId + '.jpg',
        userId + '.jpeg',
        userId + '.png',
        userId + '.webp',
      ]);
    } catch (_) { /* storage delete is best-effort */ }

    // debt_payments must be deleted before debts (FK constraint — same order as journal clear)
    await adminClient.from('debt_payments').delete().eq('user_id', userId);

    // Explicitly delete all user PII — don't rely solely on cascade
    await Promise.all([
      adminClient.from('urge_journal').delete().eq('user_id', userId),
      adminClient.from('mood_checkins').delete().eq('user_id', userId),
      adminClient.from('badges').delete().eq('user_id', userId),
      adminClient.from('losses').delete().eq('user_id', userId),
      adminClient.from('debts').delete().eq('user_id', userId),
      adminClient.from('streaks').delete().eq('user_id', userId),
      adminClient.from('game_scores').delete().eq('user_id', userId),
      adminClient.from('community_posts').delete().eq('user_id', userId),
      adminClient.from('community_comments').delete().eq('user_id', userId),
      adminClient.from('community_reactions').delete().eq('user_id', userId),
      adminClient.from('community_bookmarks').delete().eq('user_id', userId),
    ]);

    // partner_messages reference partner_links (not users directly) — delete chain
    const { data: links } = await adminClient
      .from('partner_links')
      .select('id')
      .eq('user_id', userId);
    if (links && links.length > 0) {
      const linkIds = links.map((l: { id: string }) => l.id);
      await adminClient.from('partner_messages').delete().in('link_id', linkIds);
      await adminClient.from('partner_links').delete().eq('user_id', userId);
    }

    // Delete users table row first, then delete auth user.
    // This order prevents an orphaned users row if the auth deletion fails.
    const { error: dbDeleteError } = await adminClient.from('users').delete().eq('id', userId);
    if (dbDeleteError) {
      console.error('delete-account: db delete error:', dbDeleteError.message);
      return new Response(JSON.stringify({ error: 'Failed to delete account data' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('delete-account: auth delete error:', deleteError.message);
      return new Response(JSON.stringify({ error: 'Failed to delete auth user' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('delete-account: unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
