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
export const triggerCelebration = (p: CelebrationPayload) => { _handler?.(p); };
