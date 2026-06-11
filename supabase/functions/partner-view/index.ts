import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage(streakDays: number, name: string | null, token: string, sent = false): string {
  const displayName = escHtml(name ?? 'someone you care about');
  const streakLabel = streakDays === 1 ? '1 day' : `${streakDays} days`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CornerDay — Supporting ${displayName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f9f9;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:28px 16px}
    .card{background:#fff;border-radius:22px;padding:28px 24px;max-width:420px;width:100%;box-shadow:0 2px 24px rgba(15,110,110,.09)}
    .logo{font-size:12px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:24px;text-align:center;opacity:.7}
    .streak-box{background:#e6f7f7;border-radius:16px;padding:22px 16px;text-align:center;margin-bottom:20px}
    .streak-num{font-size:56px;font-weight:800;color:#0F6E6E;line-height:1}
    .streak-sub{font-size:14px;color:#5a9090;margin-top:6px;font-weight:500}
    h2{font-size:17px;font-weight:700;color:#1a2e2e;margin-bottom:6px}
    p{font-size:14px;color:#5a7a7a;line-height:1.6;margin-bottom:20px}
    .divider{height:1px;background:#e0eded;margin:20px 0}
    label{font-size:13px;font-weight:600;color:#1a2e2e;display:block;margin-bottom:8px}
    textarea{width:100%;border:1.5px solid #c8e4e4;border-radius:12px;padding:12px 14px;font-size:15px;font-family:inherit;resize:none;outline:none;color:#1a2e2e;background:#fff;transition:border-color .2s}
    textarea:focus{border-color:#0F6E6E}
    button{width:100%;background:#0F6E6E;color:#fff;border:none;border-radius:12px;padding:14px;font-size:16px;font-weight:700;margin-top:12px;cursor:pointer;font-family:inherit;transition:opacity .15s}
    button:hover{opacity:.85}
    button:disabled{opacity:.5;cursor:default}
    .sent{background:#e6f7f7;border-radius:14px;padding:20px;text-align:center}
    .sent-title{font-size:17px;font-weight:700;color:#0F6E6E;margin-bottom:4px}
    .sent-sub{font-size:13px;color:#5a9090}
    footer{font-size:12px;color:#a8c0c0;text-align:center;margin-top:20px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">CornerDay</div>

    <div class="streak-box">
      <div class="streak-num">${streakDays}</div>
      <div class="streak-sub">days clean 🎉</div>
    </div>

    <h2>${displayName} is on a ${escHtml(streakLabel)} streak</h2>
    <p>They're working hard on their recovery. You can send them a short message of support — it'll appear in the app next time they open it.</p>

    <div class="divider"></div>

    ${sent ? `
    <div class="sent">
      <div class="sent-title">💙 Sent!</div>
      <div class="sent-sub">They'll see your message next time they open CornerDay.</div>
    </div>
    ` : `
    <label for="msg">Send encouragement</label>
    <form method="POST" action="?t=${escHtml(token)}">
      <textarea id="msg" name="message" rows="3" maxlength="200" placeholder="Write something kind… (max 200 characters)"></textarea>
      <button type="submit">Send 💙</button>
    </form>
    `}
  </div>
  <footer>CornerDay · "The day you turn it around starts today"</footer>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';

  if (!token) {
    return new Response('Not found', { status: 404 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { data: link } = await sb
    .from('partner_links')
    .select('id, user_id')
    .eq('token', token)
    .maybeSingle();

  if (!link) {
    return new Response('This link is invalid or has been revoked.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const [{ data: user }, { data: streak }] = await Promise.all([
    sb.from('users').select('display_name, expo_push_token').eq('id', link.user_id).single(),
    sb.from('streaks').select('current_streak').eq('user_id', link.user_id).single(),
  ]);

  const streakDays  = streak?.current_streak ?? 0;
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
            to: user.expo_push_token,
            sound: 'default',
            title: '💙 Message from your support person',
            body: message.length > 80 ? message.slice(0, 80) + '…' : message,
            data: { screen: '/(tabs)/' },
          }),
        });
      }
    }

    if (ct.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(renderPage(streakDays, displayName, token, !!message), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return new Response(renderPage(streakDays, displayName, token), {
    headers: { 'Content-Type': 'text/html' },
  });
});
