const NETWORK_PATTERNS = ['failed to fetch', 'network request failed', 'networkerror', 'load failed', 'the internet connection appears to be offline'];

export function isNetworkError(error: { message?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  return NETWORK_PATTERNS.some(p => error.message!.toLowerCase().includes(p));
}

export function friendlyError(error: { message?: string } | null | undefined, fallback = 'Something went wrong.'): string {
  if (!error) return fallback;
  if (isNetworkError(error)) return 'No internet connection — check your network and try again.';
  return error.message || fallback;
}
