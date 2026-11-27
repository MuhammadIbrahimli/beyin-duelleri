// Marafon: one player, three lives, short tasks that get harder step by step. The server makes every task from the
// run's seed and keeps the right answer; the client gets only the question. Time is checked on the server.
// Marafon is never rated, and no life or score can be bought.
import { MARAFON } from "../config/marafon";
import { RIDDLES } from "../config/riddles";
import { hashString, randInt, rng, shuffle } from "../shared/rng";
import type { Env } from "./env";
import { credit } from "./economy-core";
import { addProgress } from "./quests";
import { checkAchievements } from "./achievements";
import { weekKey, weekStart } from "./calendar";
import { newSeed } from "./util";

export type Kind = (typeof MARAFON.kinds)[number];
export interface Task {
  kind: Kind;
  text: string;          // only for riddles (the bank is in Azerbaijani); other kinds are localised by the client
  options: string[];
  expected: number;      // index of the right option; never sent to the client
  seq?: number[];        // memory: the digits the player watched
  seqMs?: number;        // memory: how long they are shown
  delayMs?: number;      // reaction: the wait before the signal
}

export const GRACE_MS = 1500; // network time allowed on top of a task's limit

/** Kind of task `idx` in a run: all kinds in a shuffled order each cycle, so one kind never comes 3 times in a row. */
export function kindFor(seed: number, idx: number): Kind {
  const cycle = Math.floor(idx / MARAFON.kinds.length);
  const order = shuffle(rng(hashString(`kinds:${seed}:${cycle}`)), [...MARAFON.kinds]);
  return order[idx % MARAFON.kinds.length];
}

/** Level from the number of right answers. */
export function levelFor(correct: number): number {
  return Math.min(MARAFON.maxLevel, Math.floor(correct / MARAFON.tasksPerLevel) + 1);
}

export function pointsFor(level: number): number {
  return MARAFON.pointsBase + MARAFON.pointsPerLevel * (level - 1);
}

const tasksRiddleOrder = (seed: number) => shuffle(rng(hashString(`riddle:${seed}`)), RIDDLES.map((_, i) => i));

/** The task `idx` of a run. Deterministic for (seed, idx, level). */
export function makeTask(seed: number, idx: number, level: number): Task {
  const kind = kindFor(seed, idx);
  const r = rng(hashString(`task:${seed}:${idx}`));
  if (kind === "arithmetic") {
    const hi = 10 + level * 8;
    const mul = level >= 3 && r() < 0.4;
    let a: number, b: number, ans: number, sign: string;
    if (mul) {
      a = randInt(r, 2, 3 + Math.floor(level / 2));
      b = randInt(r, 2, 12);
      ans = a * b;
      sign = "×";
    } else if (r() < 0.5) {
      a = randInt(r, 2, hi);
      b = randInt(r, 2, hi);
      ans = a + b;
      sign = "+";
    } else {
      a = randInt(r, 10, hi + 10);
      b = randInt(r, 2, a - 1);
      ans = a - b;
      sign = "−";
    }
    return choices(r, "arithmetic", `${a} ${sign} ${b}`, ans, level);
  }
  if (kind === "sequence") {
    const start = randInt(r, 1, 20);
    const geometric = level >= 4 && r() < 0.5;
    const seq = geometric
      ? [start, start * 2, start * 4, start * 8]
      : (() => {
          const d = randInt(r, 2, 3 + Math.floor(level / 2));
          return [start, start + d, start + 2 * d, start + 3 * d];
        })();
    const next = geometric ? seq[3] * 2 : seq[3] + (seq[1] - seq[0]);
    return choices(r, "sequence", seq.join(", ") + ", ?", next, level);
  }
  if (kind === "riddle") {
    const order = tasksRiddleOrder(seed);
    const riddle = RIDDLES[order[Math.floor(idx / MARAFON.kinds.length) % order.length]];
    const options = shuffle(r, [riddle.answer, ...riddle.wrong.slice(0, 3)]);
    return { kind, text: riddle.text, options, expected: options.indexOf(riddle.answer) };
  }
  if (kind === "odd") {
    // three numbers from one family and one outlier; the outlier is the right option
    const family = [(n: number) => n % 2 === 0, (n: number) => n % 3 === 0, (n: number) => n % 5 === 0][randInt(r, 0, 2)];
    const pool: number[] = [];
    for (let n = 2; n <= 60; n++) if (family(n)) pool.push(n);
    const inside = shuffle(r, pool).slice(0, 3);
    let outlier = randInt(r, 2, 60);
    while (family(outlier) || inside.includes(outlier)) outlier = randInt(r, 2, 60);
    const options = shuffle(r, [...inside, outlier].map(String));
    return { kind, text: "", options, expected: options.indexOf(String(outlier)) };
  }
  if (kind === "memory") {
    const len = 3 + Math.floor(level / 3);
    const seq: number[] = [];
    while (seq.length < len) {
      const d = randInt(r, 1, 9);
      if (seq.length && seq[seq.length - 1] === d) continue;
      seq.push(d);
    }
    const variant = (s: number[]) => {
      const v = s.slice();
      const at = randInt(r, 0, v.length - 1);
      v[at] = ((v[at] + randInt(r, 1, 8) - 1) % 9) + 1;
      return v;
    };
    const wrongs = new Set<string>();
    while (wrongs.size < 3) {
      const w = variant(seq).join("-");
      if (w !== seq.join("-")) wrongs.add(w);
    }
    const options = shuffle(r, [seq.join("-"), ...wrongs]);
    return { kind, text: "", options, expected: options.indexOf(seq.join("-")), seq, seqMs: len * 700 + 600 };
  }
  // reaction: the signal comes after `delayMs`; the answer is the tap, judged by the time after the signal
  return { kind, text: "", options: ["TAP"], expected: 0, delayMs: randInt(r, 1200, 3500) };
}

function choices(r: () => number, kind: Kind, text: string, ans: number, level: number): Task {
  const spread = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((k) => level >= 2 || k <= 5);
  const wrong = new Set<number>();
  let guard = 0;
  while (wrong.size < 3 && guard++ < 200) {
    const k = spread[randInt(r, 0, spread.length - 1)] * (r() < 0.5 ? -1 : 1);
    const w = ans + k;
    if (w !== ans && w > 0) wrong.add(w);
  }
  const options = shuffle(r, [ans, ...wrong].map(String));
  return { kind, text, options, expected: options.indexOf(String(ans)) };
}

export const limitFor = (kind: Kind) => MARAFON.limitMs[kind];
export const minFor = (kind: Kind) => (kind === "reaction" ? MARAFON.minHumanMs : 0);

// ---- database flows ---------------------------------------------------------------------------------------------

export interface RunState {
  id: string;
  user_id: string;
  seed: number;
  lives: number;
  level: number;
  correct: number;
  score: number;
  status: "active" | "ended";
}

/** What the client may see of the current task. */
function publicTask(run: RunState, idx: number, task: Task) {
  return {
    idx,
    kind: task.kind,
    text: task.text,
    options: task.options,
    seq: task.seq,
    seqMs: task.seqMs,
    delayMs: task.delayMs,
    limitMs: limitFor(task.kind),
  };
}

export function runView(run: RunState, task: Task | null, idx: number) {
  return {
    runId: run.id,
    lives: run.lives,
    level: run.level,
    correct: run.correct,
    score: run.score,
    task: task ? publicTask(run, idx, task) : null,
  };
}

async function issue(db: D1Database, run: RunState, idx: number, now: number): Promise<Task> {
  const level = levelFor(run.correct);
  const task = makeTask(run.seed, idx, level);
  await db
    .prepare("INSERT INTO marafon_tasks (run_id, idx, kind, expected, issued_at, limit_ms, min_ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(run.id, idx, task.kind, String(task.expected), now, limitFor(task.kind), minFor(task.kind))
    .run();
  return task;
}

/** The run to continue, or a new one. A player has at most one active run. */
export async function startRun(db: D1Database, uid: string, now: number) {
  const active = await db
    .prepare("SELECT * FROM marafon_runs WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
    .bind(uid)
    .first<RunState>();
  if (active) {
    const idx = await currentIdx(db, active.id);
    const task = await taskAt(db, active, idx);
    return runView(active, task, idx);
  }
  const id = crypto.randomUUID();
  const seed = newSeed();
  const run: RunState = { id, user_id: uid, seed, lives: MARAFON.lives, level: 1, correct: 0, score: 0, status: "active" };
  await db
    .prepare("INSERT INTO marafon_runs (id, user_id, seed, lives, level, correct, score, status, started_at) VALUES (?, ?, ?, ?, 1, 0, 0, 'active', ?)")
    .bind(id, uid, seed, MARAFON.lives, now)
    .run();
  const task = await issue(db, run, 0, now);
  return runView(run, task, 0);
}

async function currentIdx(db: D1Database, runId: string): Promise<number> {
  const row = await db
    .prepare("SELECT MAX(idx) AS i FROM marafon_tasks WHERE run_id = ?")
    .bind(runId)
    .first<{ i: number | null }>();
  return row?.i ?? 0;
}

/** The task of this run at `idx`, rebuilt from the seed (the answer is stored in marafon_tasks, not sent). */
async function taskAt(db: D1Database, run: RunState, idx: number): Promise<Task | null> {
  const row = await db
    .prepare("SELECT answered_at FROM marafon_tasks WHERE run_id = ? AND idx = ?")
    .bind(run.id, idx)
    .first<{ answered_at: number | null }>();
  if (!row || row.answered_at !== null) return null;
  return makeTask(run.seed, idx, levelFor(run.correct));
}

export type AnswerOutcome =
  | { ok: false; reason: "not_found" | "ended" | "stale" | "answered" }
  | { ok: true; correct: boolean; why: "ok" | "wrong" | "late" | "early"; over: boolean; view: ReturnType<typeof runView>; best: number };

/** One answer. The server decides: the right option, the time limit, and for reactions the time after the signal. */
export async function answerRun(env: Env, uid: string, runId: string, idx: number, choice: number, now: number): Promise<AnswerOutcome> {
  const db = env.DB;
  const run = await db.prepare("SELECT * FROM marafon_runs WHERE id = ? AND user_id = ?").bind(runId, uid).first<RunState>();
  if (!run) return { ok: false, reason: "not_found" };
  if (run.status !== "active") return { ok: false, reason: "ended" };
  const cur = await currentIdx(db, runId);
  if (idx !== cur) return { ok: false, reason: "stale" };
  const row = await db
    .prepare("SELECT kind, expected, issued_at, limit_ms, min_ms, answered_at FROM marafon_tasks WHERE run_id = ? AND idx = ?")
    .bind(runId, idx)
    .first<{ kind: Kind; expected: string; issued_at: number; limit_ms: number; min_ms: number; answered_at: number | null }>();
  if (!row || row.answered_at !== null) return { ok: false, reason: "answered" };
  const task = makeTask(run.seed, idx, levelFor(run.correct));

  let why: "ok" | "wrong" | "late" | "early" = "ok";
  if (row.kind === "reaction") {
    const reaction = now - (row.issued_at + (task.delayMs ?? 0));
    if (reaction < row.min_ms) why = "early";
    else if (reaction > row.limit_ms) why = "late";
  } else if (now - row.issued_at > row.limit_ms + GRACE_MS) {
    why = "late";
  }
  if (why === "ok" && choice !== Number(row.expected)) why = "wrong";
  const correct = why === "ok";

  // the answer is written once: a double tap or a retry cannot count twice
  const mark = await db
    .prepare("UPDATE marafon_tasks SET answered_at = ?, result = ? WHERE run_id = ? AND idx = ? AND answered_at IS NULL")
    .bind(now, why, runId, idx)
    .run();
  if ((mark.meta.changes ?? 0) !== 1) return { ok: false, reason: "answered" };

  const lives = correct ? run.lives : run.lives - 1;
  const correctN = correct ? run.correct + 1 : run.correct;
  const level = levelFor(correctN);
  const score = correct ? run.score + pointsFor(levelFor(run.correct)) : run.score;
  const over = lives <= 0;
  await db
    .prepare("UPDATE marafon_runs SET lives = ?, correct = ?, level = ?, score = ? WHERE id = ?")
    .bind(lives, correctN, level, score, runId)
    .run();
  if (correct) {
    await db.prepare("INSERT OR IGNORE INTO user_stats (user_id, updated_at) VALUES (?, ?)").bind(uid, now).run();
    await db.prepare("UPDATE user_stats SET marafon_correct = marafon_correct + 1 WHERE user_id = ?").bind(uid).run();
    await addProgress(db, uid, now, { marafon_correct: 1 });
  }
  const next: RunState = { ...run, lives, correct: correctN, level, score };
  if (over) {
    const best = await finishRun(env, next, now);
    return { ok: true, correct, why, over: true, view: runView(next, null, idx), best };
  }
  const nextTask = await issue(db, next, idx + 1, now);
  return { ok: true, correct, why, over: false, view: runView(next, nextTask, idx + 1), best: 0 };
}

/** A player stops a run on their own; the score stays. */
export async function stopRun(env: Env, uid: string, runId: string, now: number) {
  const run = await env.DB.prepare("SELECT * FROM marafon_runs WHERE id = ? AND user_id = ?").bind(runId, uid).first<RunState>();
  if (!run || run.status !== "active") return { ok: false as const, reason: "not_found" as const };
  const best = await finishRun(env, run, now);
  return { ok: true as const, score: run.score, best };
}

/** Ends a run and records it: the best score of the player, a weekly record (one reward per week), achievements. */
async function finishRun(env: Env, run: RunState, now: number): Promise<number> {
  const db = env.DB;
  await db.prepare("UPDATE marafon_runs SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'").bind(now, run.id).run();
  await db.prepare("INSERT OR IGNORE INTO user_stats (user_id, updated_at) VALUES (?, ?)").bind(run.user_id, now).run();
  await db
    .prepare("UPDATE user_stats SET marafon_best = MAX(marafon_best, ?), updated_at = ? WHERE user_id = ?")
    .bind(run.correct, now, run.user_id)
    .run();
  const weekBest = await db
    .prepare("SELECT COALESCE(MAX(score), 0) AS s FROM marafon_runs WHERE status = 'ended' AND started_at >= ? AND user_id = ? AND id <> ?")
    .bind(weekStart(now), run.user_id, run.id)
    .first<{ s: number }>();
  if (run.score > 0 && run.score > (weekBest?.s ?? 0)) {
    // a weekly record once per week: the reference carries the week, so a second grant is refused
    await credit(db, run.user_id, "xp", MARAFON.recordXp, `marafon_record:${weekKey(now)}:${run.user_id}:xp`, "marafon_record", now);
  }
  await checkAchievements(db, run.user_id, now);
  const best = await db
    .prepare("SELECT COALESCE(MAX(score), 0) AS s FROM marafon_runs WHERE status = 'ended' AND user_id = ?")
    .bind(run.user_id)
    .first<{ s: number }>();
  return best?.s ?? 0;
}
