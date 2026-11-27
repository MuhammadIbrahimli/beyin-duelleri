// Streak milestones of the daily test. Reached once, kept forever: breaking the streak does not take a claimed reward back.
export const STREAK_MILESTONES = [
  { days: 3, xp: 20, qizil: 10 },
  { days: 7, xp: 50, qizil: 25 },
  { days: 14, xp: 100, qizil: 50 },
  { days: 30, xp: 250, qizil: 120 },
  { days: 60, xp: 500, qizil: 250 },
  { days: 100, xp: 1000, qizil: 500 },
] as const;

/** Reward for finishing today's daily test (once per Baku day). */
export const DAILY_REWARD = { xp: 15, qizil: 5 } as const;

/** Reactions a player may send to a friend. A fixed list: no free text. */
export const FRIEND_REACTIONS = ["gg", "nice", "rematch", "ready"] as const;
export type FriendReaction = (typeof FRIEND_REACTIONS)[number];
