let _refresh: (() => void) | null = null;
export const registerHomeRefresh = (cb: () => void) => { _refresh = cb; };
// Only clears the slot if it still holds this exact callback — avoids an
// unmounting stale registration racing past a newer one that already
// re-registered (e.g. during a fast remount) and wiping it out.
export const unregisterHomeRefresh = (cb: () => void) => { if (_refresh === cb) _refresh = null; };
export const requestHomeRefresh = () => { _refresh?.(); };
