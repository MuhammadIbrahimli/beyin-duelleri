// Achievements: an open list. Each one has an objective condition read from the server's own counters,
// a rarity (colour only, no effect on play), and a one-time reward. Add an entry here to add an achievement.
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type AchStat = "wins" | "matches" | "best_streak" | "stage_wins" | "peak_rating" | "marafon_best" | "daily_claims" | "friends";

export interface AchievementDef {
  id: string;
  stat: AchStat;
  target: number;
  rarity: Rarity;
  xp: number;
  qizil: number;
  title: { az: string; ru: string };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_win", stat: "wins", target: 1, rarity: "common", xp: 20, qizil: 5, title: { az: "İlk qələbə", ru: "Первая победа" } },
  { id: "wins_10", stat: "wins", target: 10, rarity: "common", xp: 40, qizil: 15, title: { az: "10 qələbə", ru: "10 побед" } },
  { id: "wins_100", stat: "wins", target: 100, rarity: "epic", xp: 200, qizil: 80, title: { az: "100 qələbə", ru: "100 побед" } },
  { id: "unbeatable_5", stat: "best_streak", target: 5, rarity: "rare", xp: 60, qizil: 20, title: { az: "Məğlubedilməz — 5 qələbə ardıcıl", ru: "Непобедимый — 5 побед подряд" } },
  { id: "stage_master_50", stat: "stage_wins", target: 50, rarity: "rare", xp: 80, qizil: 25, title: { az: "Mərhələ ustası", ru: "Мастер этапов" } },
  { id: "matches_50", stat: "matches", target: 50, rarity: "common", xp: 50, qizil: 15, title: { az: "50 duel", ru: "50 дуэлей" } },
  { id: "league_almaz", stat: "peak_rating", target: 2000, rarity: "rare", xp: 100, qizil: 40, title: { az: "Almaz liqasına yüksəl", ru: "Выйди в лигу Алмаз" } },
  { id: "league_efsane", stat: "peak_rating", target: 3000, rarity: "legendary", xp: 300, qizil: 120, title: { az: "Əfsanə liqası", ru: "Лига Легенда" } },
  { id: "marafon_10", stat: "marafon_best", target: 10, rarity: "common", xp: 30, qizil: 10, title: { az: "Marafon: 10 doğru", ru: "Марафон: 10 верных" } },
  { id: "marafon_30", stat: "marafon_best", target: 30, rarity: "epic", xp: 120, qizil: 50, title: { az: "Marafon ustası", ru: "Мастер марафона" } },
  { id: "daily_30", stat: "daily_claims", target: 30, rarity: "rare", xp: 90, qizil: 30, title: { az: "30 gündəlik tapşırıq", ru: "30 ежедневных заданий" } },
  { id: "first_friend", stat: "friends", target: 1, rarity: "common", xp: 20, qizil: 5, title: { az: "İlk dost", ru: "Первый друг" } },
];

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];
