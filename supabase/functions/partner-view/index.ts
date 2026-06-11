import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';

  if (!token) {
    return new Response(JSON.stringify({ error: 'missing token' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: link } = await sb.from('partner_links').select('id, user_id').eq('token', token).maybeSingle();
  if (!link) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const [{ data: user }, { data: streak }] = await Promise.all([
    sb.from('users').select('display_name, expo_push_token').eq('id', link.user_id).single(),
    sb.from('streaks').select('current_streak').eq('user_id', link.user_id).single(),
  ]);

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? '').trim().slice(0, 200);
    if (!message) {
      return new Response(JSON.stringify({ error: 'empty message' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    await sb.from('partner_messages').insert({ link_id: link.id, message });
    if (user?.expo_push_token) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.expo_push_token,
          sound: 'default',
          title: '💙 Message from your support person',
          body: message.length > 80 ? message.slice(0, 80) + '…' : message,
          data: { screen: '/(tabs)/' },
        }),
      });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    streakDays: streak?.current_streak ?? 0,
    displayName: user?.display_name ?? null,
  }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
