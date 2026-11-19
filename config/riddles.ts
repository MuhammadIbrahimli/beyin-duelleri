// Riddles for "Tapmaca yarışı". The riddle texts are written for this app; the answer words were checked against
// the answer lists on https://www.testbook.az/riddle and https://oxubil.info/maraqli/asan-tapmacalar-ve-cavablari/
// (the sites were read for the answers only; no riddle text was copied).
// TODO(verify): a native speaker reads every riddle and every option before the game is published.
export interface Riddle {
  id: string;
  text: string;
  answer: string;
  /** three wrong options; they must be clearly wrong for this riddle, not just from the same family */
  wrong: [string, string, string];
}

export const RIDDLES: Riddle[] = [
  { id: "buz", text: "Suyam, amma soyuqda bərkiyirəm, istidə əriyirəm. Mən nəyəm?", answer: "Buz", wrong: ["Od", "Külək", "Daş"] },
  { id: "yumurta", text: "Ağ qabığım var, içim sarıdır, toyuq məni qoyur. Mən nəyəm?", answer: "Yumurta", wrong: ["Armud", "Kitab", "Saat"] },
  { id: "saat", text: "Əqrəbim var, amma sancmıram; rəqəmlər arasında gəzirəm. Mən nəyəm?", answer: "Saat", wrong: ["Kitab", "Çəkic", "Göz"] },
  { id: "kitab", text: "Səhifələrim çoxdur, içimdə hekayələr var, oxunduqca danışıram. Mən nəyəm?", answer: "Kitab", wrong: ["Çəkic", "Saat", "Papaq"] },
  { id: "kirpi", text: "Üstümdə tikanlar var, amma kol deyiləm; gecələr gəzirəm. Mən kiməm?", answer: "Kirpi", wrong: ["Keçi", "Pişik", "Xoruz"] },
  { id: "xoruz", text: "Səhər tezdən hamını oyadıram, qışqırıram: kukuriku! Mən kiməm?", answer: "Xoruz", wrong: ["Pişik", "Keçi", "Kirpi"] },
  { id: "pisik", text: "Dörd ayağım var, miyoldayıram, siçanı tuturam. Mən kiməm?", answer: "Pişik", wrong: ["Keçi", "Kirpi", "Xoruz"] },
  { id: "keci", text: "Südüm var, saqqalım var, dağda tullanıram. Mən kiməm?", answer: "Keçi", wrong: ["Pişik", "Kirpi", "Arı"] },
  { id: "armud", text: "Sarı-yaşıl rəngim var, budaqda asılıram, şirinəm. Mən nəyəm?", answer: "Armud", wrong: ["Nar", "Yumurta", "Kitab"] },
  { id: "nar", text: "Qabığımı açanda içimdə yüzlərlə qırmızı dənə görünür. Mən nəyəm?", answer: "Nar", wrong: ["Armud", "Saat", "Yumurta"] },
  { id: "ari", text: "Gün boyu çiçəklərdən bal yığıram, zınqıltı ilə uçuram. Mən kiməm?", answer: "Arı", wrong: ["Kirpi", "Keçi", "Xoruz"] },
  { id: "kulek", text: "Görünmürəm, amma ağacların yarpaqlarını yellədirəm. Mən nəyəm?", answer: "Külək", wrong: ["Buz", "Saat", "Kitab"] },
  { id: "ay", text: "Gecə göydə parlayıram, amma özüm işıq vermirəm. Mən nəyəm?", answer: "Ay", wrong: ["Günəş", "Külək", "Buz"] },
  { id: "goz", text: "Başımda iki pəncərəm var, onlarla dünyanı görürəm. Mən nəyəm?", answer: "Göz", wrong: ["Qulaq", "Burun", "Dil"] },
  { id: "teyyare", text: "Göydə uçuram, qanadlarım var, amma quşam deyiləm. Mən nəyəm?", answer: "Təyyarə", wrong: ["Traktor", "Gəmi", "Qatar"] },
  { id: "cekic", text: "Dəmiri döyürəm, mıxı içəri vururam. Mən nəyəm?", answer: "Çəkic", wrong: ["İynə", "Tərəzi", "Papaq"] },
  { id: "ine", text: "Ucum iti, dəridən keçirəm, arxamca sap gəzir. Mən nəyəm?", answer: "İynə", wrong: ["Çəkic", "Tərəzi", "Papaq"] },
  { id: "terezi", text: "İki gözüm var, yük qoyanda bir tərəfə əyilirəm. Mən nəyəm?", answer: "Tərəzi", wrong: ["Saat", "Kitab", "Soba"] },
  { id: "papaq", text: "Başımı örtürəm, günəşdən qoruyuram. Mən nəyəm?", answer: "Papaq", wrong: ["Çəkic", "Saat", "Kitab"] },
  { id: "soba", text: "Qışda istilik verirəm, içimdə od yanır, tüstüm bacadan çıxır. Mən nəyəm?", answer: "Soba", wrong: ["Buz", "Külək", "Çəkic"] },
  { id: "traktor", text: "Tarlanı şumlayıram, dörd təkərim var, ağır yük çəkirəm. Mən nəyəm?", answer: "Traktor", wrong: ["Təyyarə", "Gəmi", "Qatar"] },
];
