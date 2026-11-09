// Gépi játékosok. A szerver ~250 ms-onként hívja a botStep-et; minden gép a saját tempójában lép.
// A gépek csak azt "látják", amit egy játékos is látna (nem csalnak), kivéve ahol jelezve van.
import crypto from "node:crypto";
import { GAMES } from "./index.mjs";
import { DRAW_WORDS } from "./more.mjs";
import { OV_WORDS } from "./ovwords.mjs";
import { startsOk, deadline } from "./ovfl-logic.mjs";

const rnd = (n) => crypto.randomInt(n);
const rf = () => rnd(1e6) / 1e6;
const pick = (a) => a[rnd(a.length)];
const LV = { easy: 0, medium: 1, hard: 2 };
export const BOT_NAMES = ["Robi", "Gépész Géza", "Bitke", "Chipi", "Proci Pali", "Ramóna", "Kocka Kati", "Algó Ottó", "Pixel Panni", "Szilikon Szilvi"];
const tempo = (lv, base) => base * [1.6, 1.1, 0.75][lv] * (0.7 + rf() * 0.6);

// ---------- Aknakereső ----------
function minesBot(s, me, room, lv) {
  if (s.status !== "playing") return null;
  const v = GAMES.mines.view(s);
  const { w, h } = v, cells = v.cells, flags = v.flags;
  if (!s.mines) return { a: "open", i: ((h / 2) | 0) * w + ((w / 2) | 0) };
  const nb = (k) => { const x = k % w, y = (k / w) | 0, o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o.push(Y * w + X); } return o; };
  const safe = [], mine = [];
  if (!(lv === 0 && rf() < 0.1)) {
    cells.forEach((c, k) => {
      if (c < 1 || c > 8) return;
      const hid = nb(k).filter((j) => cells[j] === -1), fl = hid.filter((j) => flags[j]), un = hid.filter((j) => !flags[j]);
      if (!un.length) return;
      if (fl.length === c) safe.push(...un);
      else if (fl.length + un.length === c) mine.push(...un);
    });
  }
  if (safe.length) return { a: "open", i: pick(safe) };
  if (mine.length && lv > 0) return { a: "flag", i: pick(mine) };
  const hidden = cells.map((c, k) => (c === -1 && !flags[k] ? k : -1)).filter((k) => k >= 0);
  if (!hidden.length) return null;
  // tippelés: a nehéz gép a számoktól távol eső mezőt választja
  if (lv === 2) { const far = hidden.filter((k) => nb(k).every((j) => cells[j] === -1)); if (far.length) return { a: "open", i: pick(far) }; }
  return { a: "open", i: pick(hidden) };
}

// ---------- Amőba ----------
function amobaBot(s, me, room, lv) {
  const seat = s.seats[1] === me ? 1 : s.seats[2] === me ? 2 : 0;
  if (!seat) return null;
  if (s.winner) return rf() < 0.15 ? { a: "again" } : null;
  if (!s.seats[1] || !s.seats[2] || s.turn !== seat) return null;
  const b = s.b, N = 15, foe = seat === 1 ? 2 : 1;
  if (b.every((x) => !x)) return { a: "put", i: 7 * N + 7 };
  const lineScore = (i, who) => {
    const x0 = i % N, y0 = (i / N) | 0; let total = 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let cnt = 1, open = 0;
      for (const sg of [1, -1]) { let x = x0 + dx * sg, y = y0 + dy * sg; while (x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === who) { cnt++; x += dx * sg; y += dy * sg; } if (x >= 0 && y >= 0 && x < N && y < N && !b[y * N + x]) open++; }
      if (cnt >= 5) total += 1e6; else if (cnt === 4) total += open === 2 ? 5e4 : open ? 8e3 : 0; else if (cnt === 3) total += open === 2 ? 4e3 : open ? 400 : 0; else if (cnt === 2) total += open === 2 ? 150 : open ? 20 : 0; else total += open;
    }
    return total;
  };
  let best = -1, bi = -1;
  for (let i = 0; i < N * N; i++) {
    if (b[i]) continue;
    const x = i % N, y = (i / N) | 0; let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && b[Y * N + X]) { near = true; break; } }
    if (!near) continue;
    let sc = lineScore(i, seat) * 1.1 + lineScore(i, foe) * [0.4, 0.85, 1][lv];
    sc *= 1 + rf() * [1.2, 0.3, 0.05][lv];
    if (sc > best) { best = sc; bi = i; }
  }
  return bi >= 0 ? { a: "put", i: bi } : null;
}

// ---------- Négy a sorban ----------
function fourBot(s, me, room, lv) {
  const seat = s.seats[1] === me ? 1 : s.seats[2] === me ? 2 : 0;
  if (!seat) return null;
  if (s.winner) return rf() < 0.15 ? { a: "again" } : null;
  if (!s.seats[1] || !s.seats[2] || s.turn !== seat) return null;
  const foe = seat === 1 ? 2 : 1;
  const drop = (b, c, p) => { for (let r = 5; r >= 0; r--) if (!b[r * 7 + c]) { b[r * 7 + c] = p; return r * 7 + c; } return -1; };
  const win = (b, p) => { for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { let k = 0; for (; k < 4; k++) { const X = c + dx * k, Y = r + dy * k; if (X < 0 || Y < 0 || X > 6 || Y > 5 || b[Y * 7 + X] !== p) break; } if (k === 4) return true; } return false; };
  const evalB = (b) => { let sc = 0; for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { let m = 0, o = 0, ok = true; for (let k = 0; k < 4; k++) { const X = c + dx * k, Y = r + dy * k; if (X < 0 || Y < 0 || X > 6 || Y > 5) { ok = false; break; } const v = b[Y * 7 + X]; if (v === seat) m++; else if (v === foe) o++; } if (!ok || (m && o)) continue; sc += [0, 1, 6, 40, 1000][m] - [0, 1, 7, 50, 1000][o]; } for (let r = 0; r < 6; r++) if (b[r * 7 + 3] === seat) sc += 3; return sc; };
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  const mm = (b, d, a, bb, maxi) => {
    if (win(b, seat)) return 1e6 + d; if (win(b, foe)) return -1e6 - d; if (!d || b.every(Boolean)) return evalB(b);
    let best = maxi ? -Infinity : Infinity;
    for (const c of ORDER) { const i = drop(b, c, maxi ? seat : foe); if (i < 0) continue; const v = mm(b, d - 1, a, bb, !maxi); b[i] = 0; if (maxi) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); bb = Math.min(bb, v); } if (a >= bb) break; }
    return best;
  };
  if (lv === 0 && rf() < 0.35) { const cs = ORDER.filter((c) => !s.b[c]); return { a: "drop", col: pick(cs) }; }
  const depth = [2, 4, 6][lv], b = s.b.slice();
  let best = -Infinity, bc = 3;
  for (const c of ORDER) { const i = drop(b, c, seat); if (i < 0) continue; const v = mm(b, depth - 1, -Infinity, Infinity, false) + rf() * [30, 4, 0][lv]; b[i] = 0; if (v > best) { best = v; bc = c; } }
  return { a: "drop", col: bc };
}

// ---------- Torpedó ----------
function battleBot(s, me, room, lv) {
  const seat = s.seats[1] === me ? 1 : s.seats[2] === me ? 2 : 0;
  if (!seat) return null;
  if (s.winner) return rf() < 0.1 ? { a: "again" } : null;
  if (!s.ready[seat]) return { a: "ready" };
  if (!s.seats[1] || !s.seats[2] || !s.ready[1] || !s.ready[2] || s.turn !== seat) return null;
  const v = GAMES.battle.view(s, me), foe = seat === 1 ? 2 : 1, B = v["b" + foe];
  const unknown = B.map((c, i) => (c < 2 ? i : -1)).filter((i) => i >= 0);
  const hits = B.map((c, i) => (c === 3 ? i : -1)).filter((i) => i >= 0);
  const nb4 = (i) => { const x = i % 8, y = (i / 8) | 0; return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([X, Y]) => X >= 0 && Y >= 0 && X < 8 && Y < 8).map(([X, Y]) => Y * 8 + X); };
  if (hits.length && !(lv === 0 && rf() < 0.5)) {
    let cand = [];
    if (hits.length >= 2) { // egy vonalban folytatja
      const sameRow = hits.every((h) => ((h / 8) | 0) === ((hits[0] / 8) | 0));
      hits.forEach((h) => nb4(h).forEach((n) => { if (B[n] < 2 && (sameRow ? ((n / 8) | 0) === ((h / 8) | 0) : n % 8 === h % 8)) cand.push(n); }));
    }
    if (!cand.length) hits.forEach((h) => nb4(h).forEach((n) => { if (B[n] < 2) cand.push(n); }));
    if (cand.length) return { a: "shoot", i: pick(cand) };
  }
  // vadászat: a nehéz gép sakktábla-mintában lő, és kerüli az elsüllyedt hajók szomszédságát
  let pool = unknown;
  if (lv >= 1) { const sunk = B.map((c, i) => (c === 4 ? i : -1)).filter((i) => i >= 0); const bad = new Set(); sunk.forEach((k) => { const x = k % 8, y = (k / 8) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) bad.add((y + dy) * 8 + x + dx); }); const p2 = pool.filter((i) => !bad.has(i)); if (p2.length) pool = p2; }
  if (lv === 2) { const par = pool.filter((i) => ((i % 8) + ((i / 8) | 0)) % 2 === 0); if (par.length) pool = par; }
  return pool.length ? { a: "shoot", i: pick(pool) } : null;
}

// ---------- Memória ----------
function memoryBot(s, me, room, lv, mem) {
  mem.seen = mem.seen || {};
  s.open.forEach((i) => { if (rf() < [0.45, 0.75, 1][lv]) mem.seen[i] = s.deck[i]; });
  if (s.done || s.hideAt || s.order[s.t % s.order.length] !== me) return null;
  const unfound = (i) => !s.found[i];
  const known = Object.entries(mem.seen).filter(([i]) => unfound(+i) && !s.open.includes(+i));
  if (s.open.length === 1) {
    const e = s.deck[s.open[0]]; mem.seen[s.open[0]] = e;
    const m = known.find(([i, x]) => x === e && +i !== s.open[0]);
    if (m) return { a: "flip", i: +m[0] };
  } else {
    const by = {}; for (const [i, x] of known) (by[x] = by[x] || []).push(+i);
    const pair = Object.values(by).find((a) => a.length >= 2);
    if (pair) return { a: "flip", i: pair[0] };
  }
  const unseen = s.deck.map((_, i) => i).filter((i) => unfound(i) && !s.open.includes(i) && mem.seen[i] == null);
  const any = s.deck.map((_, i) => i).filter((i) => unfound(i) && !s.open.includes(i));
  return { a: "flip", i: pick(unseen.length ? unseen : any) };
}

// ---------- Kockapóker ----------
const UP = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
function diceBot(s, me, room, lv) {
  if (s.done || s.order[s.t % s.order.length] !== me) return null;
  if (!s.rolls) return { a: "roll" };
  const sheet = s.sheets[me], free = GAMES.dice.view(s).cats.map(([c]) => c).filter((c) => sheet[c] == null);
  const pv = GAMES.dice.view(s).preview;
  const c = [0, 0, 0, 0, 0, 0, 0]; s.d.forEach((x) => c[x]++);
  const value = (k) => { let x = pv[k]; if (UP[k]) x += c[UP[k]] >= 3 ? 12 : c[UP[k]] * UP[k] >= 2 * UP[k] ? 3 : -6; if (k === "chance") x -= 12; if (k === "yatzy" && !x) x -= 2; return x; };
  const best = free.slice().sort((a, b) => value(b) - value(a))[0];
  const strong = ["yatzy", "large", "full", "small", "four"].includes(best) && pv[best] > 0;
  if (s.rolls < 3 && !(strong && lv > 0) && !(lv === 0 && rf() < 0.3)) {
    // mit tartson meg: a leggyakoribb értéket, vagy sorhoz a különböző értékeket
    const top = c.indexOf(Math.max(...c.slice(1)), 1);
    const distinct = [1, 2, 3, 4, 5, 6].filter((v) => c[v]).length;
    const wantStraight = distinct >= 4 && (free.includes("large") || free.includes("small"));
    const keep = s.d.map((v, i) => (wantStraight ? s.d.indexOf(v) === i && !(v === 1 && c[6] && c[2]) : v === top && c[top] >= 2) || (lv === 2 && v === top && top >= 5));
    const diff = keep.findIndex((k, i) => k !== s.hold[i]);
    if (diff >= 0) return { a: "hold", i: diff };
    return { a: "roll" };
  }
  return { a: "score", cat: best };
}

// ---------- Kvíz ----------
function quizBot(s, me, room, lv, mem, now) {
  if (s.phase !== "q" || s.answers[me] != null || now < s.startAt) return null;
  if (mem.q !== s.i) { mem.q = s.i; mem.at = s.startAt + tempo(lv, 6000); }
  if (now < mem.at) return null;
  const right = rf() < [0.4, 0.65, 0.85][lv];
  const c = right ? s.qs[s.i].correct : pick([0, 1, 2, 3].filter((x) => x !== s.qs[s.i].correct));
  return { a: "answer", c };
}

// ---------- Kő-papír-olló ----------
function rpsBot(s, me) { if (s.phase !== "pick" || s.picks[me]) return null; return { a: "pick", p: pick(["ko", "papir", "ollo"]) }; }

// ---------- Reakcióidő ----------
function reactBot(s, me, room, lv, mem, now) {
  if (s.times[me] != null) return null;
  if (s.phase === "wait") { if (mem.r !== s.round) { mem.r = s.round; mem.fs = rf() < [0.08, 0.04, 0.01][lv]; } return mem.fs && now > s.goAt - 600 ? { a: "tap", ms: 0 } : null; }
  if (s.phase !== "go") return null;
  if (mem.g !== s.round) { mem.g = s.round; mem.ms = [[420, 650], [290, 420], [210, 300]][lv]; mem.ms = mem.ms[0] + rnd(mem.ms[1] - mem.ms[0]); }
  return now - s.goAt >= mem.ms ? { a: "tap", ms: mem.ms } : null;
}

// ---------- Passziánsz-verseny (szimulált haladás) ----------
function solitaireBot(s, me, room, lv, mem, now) {
  const p = s.prog[me];
  if (p && (p.done || p.gaveUp)) return null;
  if (!mem.target) { mem.target = [[11, 16], [6, 9], [4, 6]][lv]; mem.target = (mem.target[0] + rf() * (mem.target[1] - mem.target[0])) * 60000; mem.cap = lv === 0 && rf() < 0.6 ? 30 + rnd(15) : 52; }
  const el = now - s.startedAt, f = Math.min(1, el / mem.target);
  const found = Math.min(mem.cap, Math.floor(52 * Math.pow(f, 1.4)));
  if (p && p.found === found) return null;
  return { a: "progress", found, moves: Math.floor(el / 2500) };
}

// ---------- Akasztófa ----------
const FREQ = "EAOTLNSKRIMÁZGÉDVBHJYÖFUPÓCŐÍÚÜŰXWQ".split("");
const HU_WORDS = DRAW_WORDS.map((w) => w.toUpperCase());
function hangmanBot(s, me, room, lv, mem, now) {
  if (s.phase === "setup") { if (s.setter !== me) return null; const w = pick(HU_WORDS.filter((x) => x.length >= 4)); return { a: "word", word: w, hint: "" }; }
  if (s.phase !== "play" || s.setter === me) return null;
  const pat = [...s.word].map((ch) => (ch === " " || ch === "-" ? ch : s.tried.includes(ch) ? ch : "_"));
  const wrong = s.tried.filter((l) => !s.word.includes(l));
  const cand = HU_WORDS.filter((w) => w.length === pat.length && [...w].every((ch, i) => (pat[i] === "_" ? !s.tried.includes(ch) : pat[i] === ch)) && !wrong.some((l) => w.includes(l)));
  if (cand.length === 1 && lv > 0) return { a: "solve", text: cand[0] };
  let order = FREQ;
  if (cand.length && lv > 0) { const cnt = {}; cand.forEach((w) => new Set(w).forEach((ch) => (cnt[ch] = (cnt[ch] || 0) + 1))); order = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]); }
  const left = order.filter((l) => !s.tried.includes(l) && FREQ.includes(l));
  if (!left.length) return null;
  return { a: "letter", l: lv === 0 ? pick(left.slice(0, 8)) : left[0] };
}

// ---------- Ország-város ----------
function orszagBot(s, me, room, lv, mem, now) {
  if (s.status !== "playing" || now < s.startAt) return null;
  const r = s.rounds[s.round];
  if (mem.round !== s.round) {
    mem.round = s.round; mem.sent = false; mem.stopped = false;
    mem.at = s.startAt + tempo(lv, 35000);
    mem.ans = {};
    r.cats.forEach((c, i) => {
      const list = OV_WORDS[c]; if (!list || rf() > [0.55, 0.8, 0.95][lv]) return;
      const ok = list.filter((w) => startsOk(w, r.letter, r.strict, r.merge !== false));
      if (ok.length) mem.ans[i] = pick(ok);
    });
  }
  if (!mem.sent && (now >= mem.at || now >= deadline(s) - 2500)) { mem.sent = true; return { a: "ans", round: s.round, v: mem.ans }; }
  if (mem.sent && !mem.stopped && lv === 2 && !s.stopAt && Object.keys(mem.ans).length === r.cats.length) { mem.stopped = true; return { a: "stop" }; }
  return null;
}

const BOTS = { mines: minesBot, amoba: amobaBot, four: fourBot, battle: battleBot, memory: memoryBot, dice: diceBot, quiz: quizBot, rps: rpsBot, react: reactBot, solitaire: solitaireBot, hangman: hangmanBot, orszag: orszagBot };
export const BOT_GAMES = Object.keys(BOTS);
// ezeknél a reakció azonnali kell legyen (saját időzítéssel számolnak)
const INSTANT = new Set(["react", "quiz", "orszag", "solitaire"]);
const BASE = { mines: 1600, amoba: 1400, four: 1300, battle: 1500, memory: 1300, dice: 1100, rps: 1500, hangman: 4500 };

export function botStep(room, now) {
  const g = room.game; if (!g) return false;
  const fn = BOTS[g.type]; if (!fn) return false;
  let changed = false;
  for (const [pid, p] of Object.entries(room.players)) {
    if (!p.bot) continue;
    const lv = LV[p.bot.level] ?? 1;
    p.bot.mem = p.bot.mem && p.bot.mem.game === g.startedAt ? p.bot.mem : { game: g.startedAt };
    if (!INSTANT.has(g.type) && now < (p.bot.next || 0)) { if (g.type === "memory") fn(g.st, pid, room, lv, p.bot.mem, now); continue; }
    let msg = null;
    try { msg = fn(g.st, pid, room, lv, p.bot.mem, now); } catch (e) { console.error("bot", g.type, e.message); }
    if (!msg) continue;
    try { GAMES[g.type].act(g.st, pid, msg, room); changed = true; } catch (e) { /* szabálytalan lépés: kihagyja */ }
    p.bot.next = now + tempo(lv, BASE[g.type] || 1200);
  }
  return changed;
}
