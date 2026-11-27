// Daily and weekly quests. Every player gets the same quests on the same Baku day, so the conditions are equal.
// A quest counts only real finished matches (and marafon runs); a reward is claimed once per period.
export type QuestMetric = "matches" | "rated_wins" | "stage_wins" | "training" | "friendly" | "marafon_correct";

export interface QuestDef {
  id: string;
  metric: QuestMetric;
  target: number;
  xp: number;
  qizil: number;
  title: { az: string; ru: string };
}

/** Pool for the daily quests: three are picked per Baku day by a seed shared by all players. */
export const DAILY_POOL: QuestDef[] = [
  { id: "d_matches3", metric: "matches", target: 3, xp: 30, qizil: 10, title: { az: "3 duel tamamla", ru: "Заверши 3 дуэли" } },
  { id: "d_rated_wins2", metric: "rated_wins", target: 2, xp: 40, qizil: 15, title: { az: "2 reytinqli qələbə qazan", ru: "Выиграй 2 рейтинговые дуэли" } },
  { id: "d_stage_wins6", metric: "stage_wins", target: 6, xp: 30, qizil: 10, title: { az: "6 mərhələ qazan", ru: "Выиграй 6 этапов" } },
  { id: "d_training1", metric: "training", target: 1, xp: 15, qizil: 0, title: { az: "Bir məşq matçı oyna", ru: "Сыграй 1 тренировочный матч" } },
  { id: "d_friendly1", metric: "friendly", target: 1, xp: 20, qizil: 5, title: { az: "Dostla bir matç oyna", ru: "Сыграй матч с другом" } },
  { id: "d_marafon10", metric: "marafon_correct", target: 10, xp: 25, qizil: 5, title: { az: "Marafonda 10 doğru cavab ver", ru: "Дай 10 верных ответов в Марафоне" } },
];

export const DAILY_COUNT = 3;

export const WEEKLY: QuestDef[] = [
  { id: "w_matches15", metric: "matches", target: 15, xp: 100, qizil: 50, title: { az: "Həftədə 15 duel", ru: "15 дуэлей за неделю" } },
  { id: "w_rated_wins6", metric: "rated_wins", target: 6, xp: 120, qizil: 60, title: { az: "Həftədə 6 reytinqli qələbə", ru: "6 рейтинговых побед за неделю" } },
];
