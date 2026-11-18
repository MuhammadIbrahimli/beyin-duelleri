// TODO(verify): STARTER list of stems that must not appear in a display name. It is written for this project
// and is deliberately short and conservative (mostly stems of 4+ letters, so ordinary names are not blocked by accident).
// (Slurs whose skeleton is a prefix of common names, such as the n-word, are left to the admin reset on purpose.)
// Native speakers of Azerbaijani and Russian must extend and review it before real traffic.
// Words are written in plain letters; `nameSkeleton` (shared/profile.ts) folds case, diacritics, look-alike
// letters (Cyrillic/Latin, 0/o, 3/e ...) and separators on BOTH sides before comparing, so "S1k.t1r" is caught too.
export const NAME_BLOCKLIST: string[] = [
  // Azerbaijani
  "qəhbə", "amcıq", "götverən", "peysər", "siktir", "sikdir", "sikim", "orospu", "oruspu", "yarraq",
  // Russian
  "хуй", "хуе", "хуё", "пизд", "бляд", "блят", "ебан", "ебат", "ебал", "сука", "мудак", "пидор", "пидар", "залуп", "гондон", "шлюх",
  // English (common in usernames)
  "fuck", "shit", "bitch", "cunt", "faggot", "whore",
  // hate / violence
  "гитлер", "hitler", "нацист", "nazi",
];
