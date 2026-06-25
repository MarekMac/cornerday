const htmlError = (msg: string) => new Response(
  `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>⚠️ Link expired</h2><p>${msg}</p><p>Please request a new password reset link in the CornerDay app.</p></body></html>`,
  { status: 400, headers: { 'Content-Type': 'text/html' } }
);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const type = url.searchParams.get('type') ?? 'recovery';

  if (!tokenHash) return htmlError('No token provided.');

  // Relay the one-time token_hash to the app — the app calls verifyOtp() client-side.
  // This avoids exposing reusable session tokens (access_token + refresh_token) in the URL.
  const screen = type === 'signup' ? 'confirm-email' : 'reset-password';
  const deepLink = `cornerday://${screen}?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: deepLink },
  });
});
