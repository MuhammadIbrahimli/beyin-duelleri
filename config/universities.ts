// Official names of higher education institutions of Azerbaijan, as written on the Ministry of Science and Education pages.
// Source 1 (state): https://edu.gov.az/higher-education/tehsil-nazirliyinin-tabeliyinde-olan-ali-tehsil-muessiseleri (21 entries)
// Source 2 (private): https://edu.gov.az/ali-tehsil-muessiseleri/ozel-ali-tehsil-muessiseleri (8 entries)
// Both pages show "last updated 28.01.2026". Branches (filials) are not listed here: they are not separate universities.
// TODO(verify): a person should re-check these names against the pages before each public launch; the list is copied, not invented.
export const UNIVERSITIES: { id: string; name: string; source: string }[] = [
  { id: "bdu", name: "Bakı Dövlət Universiteti", source: "state" },
  { id: "adnsu", name: "Azərbaycan Dövlət Neft və Sənaye Universiteti", source: "state" },
  { id: "atu", name: "Azərbaycan Texniki Universiteti", source: "state" },
  { id: "aiu", name: "Azərbaycan Dövlət İqtisad Universiteti", source: "state" },
  { id: "adpu", name: "Azərbaycan Dövlət Pedaqoji Universiteti", source: "state" },
  { id: "amiu", name: "Azərbaycan Memarlıq və İnşaat Universiteti", source: "state" },
  { id: "bsu", name: "Bakı Slavyan Universiteti", source: "state" },
  { id: "adu", name: "Azərbaycan Dillər Universiteti", source: "state" },
  { id: "bmu", name: "Bakı Mühəndislik Universiteti", source: "state" },
  { id: "bmakad", name: "Üzeyir Hacıbəyli adına Bakı Musiqi Akademiyası", source: "state" },
  { id: "admiu", name: "Azərbaycan Dövlət Mədəniyyət və İncəsənət Universiteti", source: "state" },
  { id: "sdu", name: "Sumqayıt Dövlət Universiteti", source: "state" },
  { id: "ldu", name: "Lənkəran Dövlət Universiteti", source: "state" },
  { id: "gdu", name: "Gəncə Dövlət Universiteti", source: "state" },
  { id: "atexu", name: "Azərbaycan Texnologiya Universiteti", source: "state" },
  { id: "mdu", name: "Mingəçevir Dövlət Universiteti", source: "state" },
  { id: "ndu", name: "Naxçıvan Dövlət Universiteti", source: "state" },
  { id: "adrak", name: "Azərbaycan Dövlət Rəssamlıq Akademiyası", source: "state" },
  { id: "amk", name: "Azərbaycan Milli Konservatoriyası", source: "state" },
  { id: "qu", name: "Qarabağ Universiteti", source: "state" },
  { id: "tau", name: "Türkiyə-Azərbaycan Universiteti", source: "state" },
  { id: "qkU", name: "Qərbi Kaspi Universiteti", source: "private" },
  { id: "au", name: "Azərbaycan Universiteti", source: "private" },
  { id: "xu", name: "Xəzər Universiteti", source: "private" },
  { id: "odlar", name: "\"Odlar Yurdu\" Universiteti", source: "private" },
  { id: "bau", name: "Bakı Avrasiya Universiteti", source: "private" },
  { id: "akU", name: "Azərbaycan Kooperasiya Universiteti", source: "private" },
  { id: "bbu", name: "Bakı Biznes Universiteti", source: "private" },
  { id: "aeskma", name: "Azərbaycan Əmək və Sosial Münasibətlər Akademiyası", source: "private" },
];
