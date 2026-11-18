// "Qrupla!" bonus after Yaddaş zənciri: purely local, nothing is sent to the server.
import { h, mount } from "./dom";
import { az, t } from "./i18n";

const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const group = (d: string) => `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
const hits = (a: string, b: string) => [...a].filter((c, i) => c === b[i]).length;
const app = () => document.getElementById("app")!;
const screen = (...kids: Node[]) => mount(app(), h("div", { class: "screen" }, ...kids));

function round(label: string, shown: string, target: string): Promise<number> {
  return new Promise((resolve) => {
    screen(h("h2", null, label), h("div", { class: "digits" }, shown));
    setTimeout(() => {
      const input = h("input", { class: "numinput", inputmode: "numeric", maxlength: 7, "aria-label": az.qrupla.type }) as HTMLInputElement;
      screen(h("h2", null, label), h("p", { class: "muted" }, az.qrupla.type), input,
        h("button", { class: "btn primary block", onclick: () => resolve(hits(input.value.replace(/\D/g, ""), target)) }, az.qrupla.check));
      input.focus();
    }, 4000);
  });
}

export async function qrupla() {
  const a = digits(7), b = digits(7);
  screen(h("h1", null, az.qrupla.title), h("p", null, az.qrupla.intro),
    h("button", { class: "btn primary block", onclick: go }, az.common.start));
  async function go() {
    const ra = await round(az.qrupla.plain, a, a);
    const rb = await round(az.qrupla.grouped, group(b), b);
    screen(h("h1", null, t("qrupla.summary", { a: ra, b: rb })), h("p", null, az.qrupla.lesson),
      h("a", { class: "btn block", href: "/result", "data-link": "" }, az.common.back));
  }
}
