// Module-level flags shared between _layout.tsx and other screens.
// Mutations are intentional side-effects — avoids prop-drilling or context for
// these rare, short-lived conditions.
export const authFlags = {
  // True while Google OAuth is in flight — blocks the SIGNED_OUT timer so it
  // never navigates to welcome during the OAuth SIGNED_OUT → SIGNED_IN pair.
  googleOAuthInProgress: false,
  // True while the user has explicitly tapped "Sign out" — blocks any
  // SIGNED_IN event (e.g. a concurrent token refresh) from re-routing to tabs.
  signingOut: false,
  // True immediately before navigating to home after a full data reset, so the
  // home screen knows to show its loading state instead of briefly showing stale data.
  postResetInProgress: false,
};
