// All UI text lives here. TODO(verify): every string needs a check by a native Azerbaijani speaker
// (and the science blurbs by someone who can vouch for the sources).
export const az = {
  app: { name: "Beyin duelləri", tagline: "Beynini dostunla yoxla." },
  nav: { experiments: "Təcrübələr", duels: "Duellər", ranking: "Reytinq", passport: "Pasport" },
  home: {
    title: "Beynini yoxla.",
    sub: "60 saniyə. Qeydiyyat yoxdur.",
    start: "Başla",
    all: "Bütün təcrübələr",
    daily: "Günün təcrübəsi",
    privacy: "Anonim statistika toplayırıq. Şəxsi məlumat yoxdur.",
  },
  common: {
    start: "Başla",
    back: "Geri",
    loading: "Yüklənir…",
    error: "Nəsə alınmadı. Bir azdan yenə yoxla.",
    retry: "Yenidən cəhd et",
    otherExperiment: "Başqa təcrübə",
    notDiagnosis: "Bu test diaqnoz deyil.",
    ms: "ms",
  },
  experiments: {
    refleks: {
      name: "Refleks",
      hook: "Ekran yaşıl olanda toxun. Tez ol, amma tələsmə.",
      measure: "Ölçürük: siqnaldan hərəkətə qədər reaksiya vaxtını.",
      unit: "ms",
    },
    "reng-ve-soz": {
      name: "Rəng və söz",
      hook: "Sözü yox, hərflərin rəngini seç.",
      measure: "Ölçürük: diqqətin avtomatik oxumaya qarşı dayanma gücünü.",
      unit: "ms",
    },
    "yaddas-zenciri": { name: "Yaddaş zənciri", hook: "Plitələrin ardıcıllığını yadda saxla.", measure: "Ölçürük: işçi yaddaşın həcmini.", unit: "" },
    "yalanci-yaddas": { name: "Yalançı yaddaş", hook: "Sözləri xatırla. Hamısını?", measure: "Ölçürük: yaddaşın nə qədər dəqiq olduğunu.", unit: "%" },
    "eyni-rengdir": { name: "Eyni rəngdir?", hook: "Gözlərinə nə qədər inanırsan?", measure: "Ölçürük: görmənin kontekstə necə aldandığını.", unit: "" },
    lovber: { name: "Lövbər", hook: "Təsadüfi rəqəm cavabını dəyişir?", measure: "Ölçürük: ilk görülən rəqəmin təxmin üzərində təsirini.", unit: "" },
  },
  intro: { watch: "Videonu izlə" },
  play: {
    wait: "Gözlə…",
    now: "İndi!",
    tooEarly: "Tezdir! Yaşıla qədər gözlə.",
    tapToStart: "Hazırsan?",
    colorBlind: "Rəng görmədə çətinlik çəkirəm",
    colorNames: ["qırmızı", "mavi", "yaşıl", "sarı"],
    shapeNames: ["dairə", "kvadrat", "üçbucaq", "ulduz"],
    progress: "{n}/{total}",
  },
  result: {
    yourResult: "Sənin nəticən",
    level: "Səviyyə {n}",
    compareFaster: "Sən bu təcrübədə iştirakçıların {pct}%-dən sürətlisin",
    compareFirst: "Sən ilk qatılanlardansın",
    callFriend: "Dostunu çağır",
    again: "Yenidən cəhd et",
    invalid: "Bu nəticə reytinqə daxil edilmədi. Yenidən cəhd et.",
    science: "Elm necə deyir",
    source: "Mənbə",
    sourcePending: "Mənbə tezliklə əlavə olunacaq",
    secondary: {
      earlyTaps: "Tez toxunma: {n}",
      errors: "Səhv: {n}",
      interference: "Beynin nə qədər çaşdı: +{n} ms",
    },
    levels: {
      refleks: ["Tısbağa", "Pişik", "Qartal", "Şimşək"],
      "reng-ve-soz": ["Çaşqın", "Diqqətli", "Kəskin", "Lazer"],
      "yaddas-zenciri": ["Qısa zəncir", "Orta zəncir", "Uzun zəncir", "Dəmir zəncir"],
      "yalanci-yaddas": ["Dumanlı", "Aydın", "Kəskin", "Arxiv"],
      "eyni-rengdir": ["Tam aldandın", "Aldandın", "Diqqətli", "Şübhəçi"],
      lovber: ["", "", "", ""],
    } as Record<string, string[]>,
  },
  science: {
    refleks:
      "Sadə reaksiya vaxtı siqnal görəndən hərəkətə qədər keçən müddətdir: göz, görmə qabığı, hərəkət qabığı, əzələ. Telefonda ekran və sensor gecikməsi səbəbindən rəqəmlər daha böyük çıxır, ona görə müqayisə proqram daxilində və cihaz sinfinə görə aparılır.",
    "reng-ve-soz":
      "Stroop effekti 1935-ci ildə təsvir olunub: sözü oxumaq demək olar ki, avtomatikdir və rəngi adlandırmağa mane olur. Beyin artıq cavabı basdırmalıdır. Bu, diqqətə nəzarətin klassik ölçüsüdür.",
    "yaddas-zenciri": "TODO(verify)",
    "yalanci-yaddas": "TODO(verify)",
    "eyni-rengdir": "TODO(verify)",
    lovber: "TODO(verify)",
  } as Record<string, string>,
  share: {
    title: "Dostunu çağır",
    intro: "Linki göndər. Onun nəticəsi sən bitirənə qədər gizli qalacaq.",
    message: "Mən {name} təcrübəsində {score} göstərdim. Səndə nə qədərdir? Yoxla:",
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    instagram: "Instagram Stories",
    copy: "Linki kopyala",
    copied: "Kopyalandı",
    groupTitle: "Qrup duelu",
  },
  invite: {
    title: "{nick} səni beyin duelinə çağırır",
    hidden: "Onun nəticəsi gizlidir — sən bitirib sonra görəcəksən.",
    accept: "Qəbul edirəm",
    expired: "Bu dəvətin vaxtı bitib.",
    closed: "Bu duelə artıq başqası qoşulub.",
    seeResult: "Nəticəyə bax",
    own: "Bu sənin duelindir. Dostunun bitirməsini gözlə.",
    waiting: "Hələ heç kim bitirməyib.",
  },
  duel: {
    winYou: "Qalib: Sən!",
    winOther: "Qalib: {nick}",
    tie: "Bərabərlik",
    rematch: "Revanş",
    group: "Qrup duelu yarat",
    you: "Sən",
    groupRank: "Qrup reytinqi",
    deviceNote: "Fərqli cihazlar nəticəyə təsir edə bilər.",
  },
  soon: "Tezliklə",
} as const;

export type Az = typeof az;

/** t("result.level", { n: 3 }) -> "Səviyyə 3". Missing keys return the key itself. */
export function t(path: string, vars?: Record<string, string | number>): string {
  let cur: unknown = az;
  for (const k of path.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[k];
  if (typeof cur !== "string") return path;
  return vars ? cur.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : cur;
}
