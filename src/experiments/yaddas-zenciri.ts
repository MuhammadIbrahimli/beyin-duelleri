import { h, mount } from "../dom";
import { az, t } from "../i18n";

export interface MemSchedule { seqs: number[][][] }
interface Attempt { taps: number[]; ms: number }
const MIN = 3, MAX = 12, STEP_ON = 550, STEP_OFF = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function play(root: HTMLElement, schedule: MemSchedule): Promise<{ attempts: Attempt[] }> {
  const title = h("div", { class: "dots" });
  const status = h("div", { class: "soft" });
  const cells = Array.from({ length: 9 }, () => h("button", { class: "cell", "aria-label": "" }));
  const grid = h("div", { class: "grid3" }, ...cells);
  mount(root, h("div", { class: "screen full", style: "position:relative" }, title, h("div", { class: "stage" }, status, grid)));

  const attempts: Attempt[] = [];
  let len = MIN, attempt = 0;
  let onTap: ((i: number) => void) | null = null;
  cells.forEach((c, i) => c.addEventListener("pointerdown", () => onTap?.(i)));
  const flash = async (i: number, cls: string, ms: number) => {
    cells[i].classList.add(cls);
    await sleep(ms);
    cells[i].classList.remove(cls);
  };

  await sleep(500);
  for (;;) {
    const seq = schedule.seqs[len - MIN][attempt];
    title.textContent = t("play.length", { n: len });
    status.textContent = az.play.watch;
    await sleep(500);
    for (const c of seq) {
      await flash(c, "on", STEP_ON);
      await sleep(STEP_OFF);
    }
    status.textContent = az.play.yourTurn;

    const res = await new Promise<Attempt & { ok: boolean }>((resolve) => {
      const taps: number[] = [];
      const start = performance.now();
      onTap = (i) => {
        taps.push(i);
        const right = i === seq[taps.length - 1];
        void flash(i, right ? "on" : "bad", 200);
        if (!right || taps.length === len) {
          onTap = null;
          resolve({ taps, ms: Math.round(performance.now() - start), ok: right });
        }
      };
    });
    attempts.push({ taps: res.taps, ms: res.ms });
    await sleep(400);
    if (res.ok) {
      if (len === MAX) return { attempts };
      len++;
      attempt = 0;
    } else {
      if (attempt === 1) return { attempts };
      attempt = 1;
      status.textContent = az.play.mistake;
      await sleep(900);
    }
  }
}
