export const COMMUNITY_TAGS = ['#FirstWeek', '#Milestone', '#WinToday', '#Struggling', '#SlipUp'] as const;
export const REACTION_EMOJIS = ['❤️', '💪', '🙏', '🎉', '😢'] as const;
export type CommunityTag = typeof COMMUNITY_TAGS[number];

export const TAG_COLORS: Record<string, string> = {
  '#FirstWeek': '#0F6E6E',
  '#Milestone': '#f59e0b',
  '#WinToday': '#16a34a',
  '#Struggling': '#7c3aed',
  '#SlipUp': '#ea580c',
};

const AVATAR_COLORS = ['#0F6E6E', '#7c3aed', '#ea580c', '#16a34a', '#f59e0b', '#e11d48'];

export function avatarColor(userId: string) {
  const hash = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function streakBadge(days: number): string | null {
  if (days <= 0) return null;
  if (days < 7)   return `🌱 ${days}d`;
  if (days < 30)  return `⭐ ${days}d`;
  if (days < 60)  return `🔥 ${days}d`;
  if (days < 180) return `🏆 ${days}d`;
  if (days < 365) return `💎 ${days}d`;
  return `👑 ${days}d`;
}

export function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}
