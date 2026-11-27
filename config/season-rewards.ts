// Season rewards, given once per season to a player by the season's best rating (peak).
// The highest threshold reached counts. The title is a reward only and is never sold.
export const SEASON_REWARDS: { peak: number; qizil: number; item?: string }[] = [
  { peak: 1500, qizil: 50 },
  { peak: 2000, qizil: 100 },
  { peak: 2500, qizil: 200, item: "ti_champion" },
  { peak: 3000, qizil: 400, item: "ti_champion" },
];

export function seasonRewardFor(peak: number) {
  let r: (typeof SEASON_REWARDS)[number] | null = null;
  for (const t of SEASON_REWARDS) if (peak >= t.peak) r = t;
  return r;
}
