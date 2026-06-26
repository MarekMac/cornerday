// Module-level flag: true while Google OAuth is in flight.
// Blocks the SIGNED_OUT timer in _layout.tsx so it never navigates
// to the welcome screen during the OAuth flow, regardless of async timing.
export const authFlags = {
  googleOAuthInProgress: false,
};
