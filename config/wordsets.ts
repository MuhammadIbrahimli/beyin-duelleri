// TODO(verify): word sets must be checked by a native speaker (association strength, spelling, no
// unintended words). SPEC asks for at least 10 sets with different lures ("sürət", "soğuq", "dağ", ...);
// only the first set from SPEC exists so far. Without more sets every day/duel repeats this one.
export interface DrmSet {
  id: string;
  lure: string;          // never shown during study, shown in the test
  studied: string[];     // 12 words shown one by one
  unrelated: string[];   // 5 new, unrelated words for the test
}

export const DRM_SETS: DrmSet[] = [
  {
    id: "yuxu",
    lure: "yuxu",
    studied: ["yastıq", "yorğan", "çarpayı", "gecə", "istirahət", "yorğunluq", "röya", "xorultu", "pijama", "yataq", "qaranlıq", "dincəlmək"],
    unrelated: ["pəncərə", "çay", "maşın", "kitab", "dəniz"],
  },
];
export const DRM_STUDY_MS = 1500;
export const DRM_DISTRACT_MS = 15000;
