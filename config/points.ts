// How a raw result becomes 0-100 "points". Each curve is [raw value, points], sorted by raw value ascending;
// values between points are interpolated, values outside are clamped.
// TODO(verify): these anchor points follow the starter level thresholds from SPEC (level 4 boundary = 85 points,
// level 3 = 65, level 2 = 40). Recompute them from real percentiles after the first few hundred runs.
export const POINT_CURVES: Record<string, [number, number][]> = {
  refleks: [[150, 100], [230, 85], [280, 65], [350, 40], [600, 0]],                 // median ms, lower is better
  "reng-ve-soz": [[500, 100], [650, 85], [850, 65], [1100, 40], [2500, 0]],         // focus score ms, lower is better
  "yaddas-zenciri": [[0, 0], [3, 10], [5, 40], [6, 65], [8, 85], [12, 100]],        // longest chain, higher is better
  "yalanci-yaddas": [[40, 0], [70, 40], [86, 65], [96, 85], [100, 100]],            // accuracy %, higher is better
  "eyni-rengdir": [[0, 100], [1, 65], [2, 40], [3, 10]],                            // times fooled, lower is better
  "go-no-go": [[300, 100], [380, 85], [480, 65], [650, 40], [1500, 0]],            // mean reaction + penalties, ms, lower is better
  "reqem-yaddasi": [[0, 0], [3, 10], [5, 40], [7, 65], [9, 85], [12, 100]],       // longest digit sequence, higher is better
  lovber: [[0, 100], [5, 90], [15, 70], [40, 40], [100, 10], [300, 0]],        // % away from the true value (TODO(verify): starter curve)
};
