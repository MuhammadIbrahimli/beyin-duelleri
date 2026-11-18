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
  "n-back": [[50, 0], [70, 40], [85, 65], [95, 85], [100, 100]],                    // accuracy %, higher is better
  dsst: [[500, 100], [700, 85], [900, 65], [1200, 40], [2500, 0]],                  // mean correct RT + error penalty, ms
  "mental-rotation": [[600, 100], [900, 85], [1300, 65], [1800, 40], [3500, 0]],    // mean correct RT + error penalty, ms
  "task-switch": [[400, 100], [550, 85], [750, 65], [1000, 40], [2000, 0]],         // mean correct RT + error penalty, ms
  hanoi: [[0, 100], [1, 85], [3, 65], [6, 40], [15, 0]],                            // extra moves beyond the optimum, lower is better
  "visual-search": [[500, 100], [800, 85], [1100, 65], [1500, 40], [3000, 0]],     // mean correct RT + error penalty, ms
  bart: [[0, 0], [100, 20], [200, 40], [300, 65], [400, 85], [600, 100]],           // collected points, higher is better
  matrix: [[0, 0], [3, 30], [5, 50], [6, 65], [7, 80], [8, 100]],                   // puzzles solved, higher is better
  "change-detection": [[50, 0], [70, 40], [85, 65], [95, 85], [100, 100]],          // percent correct, higher is better
  posner: [[280, 100], [350, 85], [450, 65], [600, 40], [1200, 0]],                // mean correct RT + error penalty, ms
  mot: [[0, 0], [40, 20], [60, 40], [75, 65], [90, 85], [100, 100]],               // percent of targets found, higher is better
  "card-sort": [[0, 100], [3, 85], [6, 65], [10, 40], [20, 0]],                   // errors, lower is better
  "time-estimation": [[0, 100], [100, 85], [200, 65], [350, 40], [700, 0]],         // mean absolute error, ms, lower is better
  "cognitive-reflection": [[0, 0], [2, 30], [3, 50], [4, 75], [5, 100]],            // correct answers, higher is better
  "word-recall": [[0, 0], [3, 20], [5, 40], [7, 65], [9, 85], [12, 100]],         // words recalled, higher is better
  "attentional-blink": [[30, 0], [50, 40], [65, 65], [80, 85], [95, 100]],          // percent of digits correct, higher is better
  syllogism: [[0, 0], [3, 30], [4, 50], [5, 70], [6, 100]],                          // correct judgements of 6, higher is better
  "mental-arithmetic": [[2000, 100], [3000, 85], [4000, 65], [5000, 40], [8000, 0]], // mean correct time + error penalty, ms
  "random-dot-motion": [[50, 0], [70, 40], [85, 65], [95, 85], [100, 100]],        // percent correct, higher is better
  numerosity: [[0, 100], [0.25, 85], [0.5, 65], [1, 40], [3, 0]],                   // mean absolute error in dots, lower is better
  "line-bisection": [[0, 100], [1, 85], [2, 65], [4, 40], [10, 0]],                 // mean absolute error in % of the line, lower is better
  "iowa-gambling": [[-1500, 0], [0, 40], [800, 65], [1500, 85], [2500, 100]],       // net gain, higher is better
  "pitch-discrimination": [[50, 0], [70, 40], [85, 65], [95, 85], [100, 100]],      // percent correct, higher is better
  "inattentional-blindness": [[33, 0], [50, 40], [67, 65], [84, 85], [100, 100]],  // percent correct, higher is better
  "finger-tapping": [[30, 0], [45, 40], [55, 65], [65, 85], [75, 100]],             // taps in 10 seconds, higher is better
  "contrast-detection": [[50, 0], [70, 40], [85, 65], [95, 85], [100, 100]],        // percent correct, higher is better
  "probability-matching": [[50, 0], [58, 40], [64, 65], [70, 90], [80, 100]],       // percent correct, higher is better
  lovber: [[0, 100], [5, 90], [15, 70], [40, 40], [100, 10], [300, 0]],        // % away from the true value (TODO(verify): starter curve)
};
