// TODO(verify): every set below was written for this project and must be checked by a native speaker
// (association strength, spelling, no accidental overlap with the lure, no unintended words).
// SPEC asks for at least 10 sets per language with different lures: there are 10 for Azerbaijani and 10 for
// Russian. After the first hundreds of plays, check how often each lure is "remembered" and drop weak sets.
export interface DrmSet {
  id: string;
  lang: "az" | "ru";
  lure: string;          // never shown during study, shown in the test
  studied: string[];     // 12 words shown one by one
  unrelated: string[];   // 5 new, unrelated words for the test
}

const set = (lang: "az" | "ru", lure: string, studied: string, unrelated: string): DrmSet =>
  ({ id: `${lang}-${lure}`, lang, lure, studied: studied.split(" "), unrelated: unrelated.split(" ") });

export const DRM_SETS: DrmSet[] = [
  // ---- Azərbaycanca ----
  { id: "yuxu", lang: "az", lure: "yuxu", studied: ["yastıq", "yorğan", "çarpayı", "gecə", "istirahət", "yorğunluq", "röya", "xorultu", "pijama", "yataq", "qaranlıq", "dincəlmək"], unrelated: ["pəncərə", "çay", "maşın", "kitab", "dəniz"] },
  set("az", "soyuq", "qar buz qış isti palto titrəmək külək şaxta əlcək şərf donmaq çovğun", "qələm divar alma mətbəx göyərçin"),
  set("az", "dağ", "təpə zirvə qaya dırmanmaq yüksəklik meşə dərə yamac aşırım alpinist ətək bulaq", "stəkan pul paltar televizor mağaza"),
  set("az", "sürət", "tez yarış qaçmaq təcil motor ildırım qatar ox yol vaxt tormoz finiş", "çiçək süd divan sabun şəkər"),
  set("az", "həkim", "xəstə xəstəxana dərman şprits müayinə palata reçetə tibb stetoskop cərrah analiz xalat", "ayaqqabı pəncərə limon velosiped qum"),
  set("az", "musiqi", "mahnı not gitara pianino səs ritm konsert tar melodiya qulaq mikrofon xor", "kərpic portağal stol təyyarə açar"),
  set("az", "meyvə", "alma armud üzüm bağ nar gilas şirə banan şaftalı gavalı limon bazar", "saat qapı dəftər ayna polad"),
  set("az", "şirin", "şəkər bal konfet tort dad qənd şokolad mürəbbə paxlava dondurma bəkməz lokum", "divar çəkic yağış avtobus kitabxana"),
  set("az", "qəzəb", "hirs dava qışqırmaq hiddət əsəbi qırmızı yumruq partlayış söyüş kin sərt narazılıq", "çəmən kreslo gümüş kamera körpü"),
  set("az", "məktəb", "müəllim şagird dərs sinif zəng lövhə imtahan direktor parta tənəffüs qiymət çanta", "balıq qaşıq bulud ulduz limonad"),
  // ---- Русский ----
  { id: "son", lang: "ru", lure: "сон", studied: ["подушка", "одеяло", "кровать", "ночь", "отдых", "усталость", "храп", "пижама", "постель", "темнота", "дремота", "зевота"], unrelated: ["окно", "чай", "машина", "книга", "море"] },
  set("ru", "холод", "снег лёд зима тепло шуба дрожь ветер мороз перчатки шарф озноб метель", "ручка стена яблоко кухня голубь"),
  set("ru", "гора", "холм вершина скала восхождение высота лес ущелье склон перевал альпинист подножие родник", "стакан деньги одежда телевизор магазин"),
  set("ru", "скорость", "быстро гонка бег ускорение мотор молния поезд стрела дорога время тормоз финиш", "цветок молоко диван мыло сахар"),
  set("ru", "врач", "больной больница лекарство шприц осмотр палата рецепт медицина стетоскоп хирург анализ халат", "ботинок форточка лимон велосипед песок"),
  set("ru", "музыка", "песня нота гитара пианино звук ритм концерт скрипка мелодия ухо микрофон хор", "кирпич апельсин стол самолёт ключ"),
  set("ru", "фрукт", "яблоко груша виноград сад гранат вишня сок банан персик слива лимон рынок", "часы дверь тетрадь зеркало сталь"),
  set("ru", "сладкий", "сахар мёд конфета торт вкус шоколад варенье пахлава мороженое халва пряник леденец", "стена молоток дождь автобус библиотека"),
  set("ru", "злость", "гнев драка крик ярость раздражение красный кулак взрыв ругань обида жёсткий недовольство", "луг кресло серебро блокнот камера"),
  set("ru", "школа", "учитель ученик урок класс звонок доска экзамен директор парта перемена оценка портфель", "рыба ложка облако звезда лимонад"),
];
export const DRM_STUDY_MS = 1500;
export const DRM_DISTRACT_MS = 15000;
