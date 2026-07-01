export type CelebrationPayload = {
  type?: string;
  emoji: string;
  label: string;
  celebration: { icon: string; text: string };
  msg: string;
  earnedAt?: string;
};

let _handler: ((p: CelebrationPayload) => void) | null = null;

export const registerCelebrationHandler = (fn: (p: CelebrationPayload) => void) => { _handler = fn; };
// Only clears the slot if it still holds this exact handler — avoids an
// unmounting stale registration racing past a newer one that already
// re-registered (e.g. during a fast remount) and wiping it out.
export const unregisterCelebrationHandler = (fn: (p: CelebrationPayload) => void) => { if (_handler === fn) _handler = null; };
export const triggerCelebration = (p: CelebrationPayload) => { _handler?.(p); };
