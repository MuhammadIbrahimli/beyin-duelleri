// TODO(verify): final city list with the channel owner. "other" is the bucket for small cities.
export const CITY_CODES = [
  "baki", "gence", "sumqayit", "mingecevir", "seki", "lenkeran",
  "naxcivan", "sirvan", "quba", "yevlax", "xaricden", "diger",
] as const;
export type CityCode = (typeof CITY_CODES)[number];
export const OTHER_CITY: CityCode = "diger";
export const CITY_MIN_PARTICIPANTS = 30;
export const PERCENTILE_MIN_RUNS = 200;
