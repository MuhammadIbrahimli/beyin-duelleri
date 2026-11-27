// Weekly city battles. Participation is free. A city's score is the AVERAGE of its players' win rates (not a sum),
// so a bigger city does not win just by having more players. Only players with a minimum number of matches count,
// and a city needs a minimum number of such players; otherwise its result is shown as "not enough players".
export const CITY_BATTLE = {
  /** pairs rotate week by week: week n uses pairs[n % pairs.length] */
  pairs: [
    ["baki", "sumqayit"],
    ["gence", "mingecevir"],
    ["sirvan", "quba"],
    ["naxcivan", "lenkeran"],
  ] as [string, string][],
  /** names are shown as written in Azerbaijani; the client keeps the same spelling */
  names: {
    baki: "Bakı",
    sumqayit: "Sumqayıt",
    gence: "Gəncə",
    mingecevir: "Mingəçevir",
    sirvan: "Şirvan",
    quba: "Quba",
    naxcivan: "Naxçıvan",
    lenkeran: "Lənkəran",
  } as Record<string, string>,
  /** a player counts after this many finished (non-training) matches in the week */
  minMatchesPerPlayer: 3,
  /** a city needs this many counted players, or its score is not shown */
  minPlayersPerCity: 10,
  /** a city change is allowed once in this many days; a player who changed the city this week is not counted */
  cityChangeCooldownMs: 30 * 24 * 60 * 60 * 1000,
};
