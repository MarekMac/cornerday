import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';

  if (!token) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: link } = await sb.from('partner_links').select('id, user_id').eq('token', token).maybeSingle();
  if (!link) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const [{ data: user }, { data: streak }] = await Promise.all([
    sb.from('users').select('display_name, expo_push_token').eq('id', link.user_id).single(),
    sb.from('streaks').select('current_streak').eq('user_id', link.user_id).single(),
  ]);

  const streakDays = streak?.current_streak ?? 0;
  const displayName = user?.display_name ?? null;

  if (req.method === 'POST') {
    let message = '';
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      message = String(body.message ?? '').trim().slice(0, 200);
    } else {
      const form = await req.formData().catch(() => new FormData());
      message = String(form.get('message') ?? '').trim().slice(0, 200);
    }
    if (message) {
      await sb.from('partner_messages').insert({ link_id: link.id, message });
      if (user?.expo_push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.expo_push_token, sound: 'default',
            title: '💙 Message from your support person',
            body: message.length > 80 ? message.slice(0, 80) + '…' : message,
            data: { screen: '/(tabs)/' },
          }),
        });
      }
    }
    return new Response(JSON.stringify({ ok: true, streakDays, displayName }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ streakDays, displayName }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
