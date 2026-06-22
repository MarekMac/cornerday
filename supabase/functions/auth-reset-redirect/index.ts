const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const htmlError = (msg: string) => new Response(
  `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>⚠️ Link expired</h2><p>${msg}</p><p>Please request a new password reset link in the CornerDay app.</p></body></html>`,
  { status: 400, headers: { 'Content-Type': 'text/html' } }
);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const type = url.searchParams.get('type') ?? 'recovery';

  if (!tokenHash) return htmlError('No token provided.');

  // Verify token via POST (GET with token_hash is not supported by GoTrue)
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ token_hash: tokenHash, type }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    console.error('verify failed:', JSON.stringify(err));
    return htmlError(err.msg || 'Verification failed. The link may have expired.');
  }

  const { access_token, refresh_token } = await verifyRes.json();

  // Redirect to app with session tokens in the URL fragment
  const screen = type === 'signup' ? 'confirm-email' : 'reset-password';
  const deepLink = `cornerday://${screen}#access_token=${access_token}&refresh_token=${refresh_token}&type=${type}`;
  return new Response(null, {
    status: 302,
    headers: { 'Location': deepLink },
  });
});
