// A játékok szabályai. Minden játék: { id, name, min, create(room, opts, pid), act(st, pid, msg, room), view(st, pid, room) }
// A hibát szöveges kivételként dobjuk, ezt a szerver visszaküldi a játékosnak.
import crypto from "node:crypto";

const rnd = (n) => crypto.randomInt(n);
const err = (m) => { throw new Error(m); };
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);

// ---------------- Aknakereső (közös tábla) ----------------
const MINE_SIZES = { kicsi: [9, 9, 10], kozepes: [12, 12, 24], nagy: [14, 14, 38] };
const mines = {
  id: "mines", name: "Aknakereső", min: 1,
  create(room, opts) {
    const [w, h, n] = MINE_SIZES[opts.size] || MINE_SIZES.kicsi;
    return { w, h, n, size: opts.size in MINE_SIZES ? opts.size : "kicsi", mines: null, open: new Array(w * h).fill(false), flags: {}, status: "playing", scores: {}, boom: -1, loser: null, startedAt: Date.now(), endedAt: 0 };
  },
  act(s, pid, m) {
    if (s.status !== "playing") err("Vége a játéknak.");
    const i = m.i | 0;
    if (i < 0 || i >= s.w * s.h) err("Rossz mező.");
    const nb = (k) => { const x = k % s.w, y = (k / s.w) | 0, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < s.w && Y < s.h) out.push(Y * s.w + X); } return out; };
    if (m.a === "flag") {
      if (s.open[i]) return;
      if (s.flags[i]) delete s.flags[i]; else s.flags[i] = pid;
      return;
    }
    if (m.a !== "open" || s.flags[i] || s.open[i]) return;
    if (!s.mines) { // az első nyitás biztonságos, a környéke is
      const safe = new Set([i, ...nb(i)]); const set = new Set();
      while (set.size < s.n) { const k = rnd(s.w * s.h); if (!safe.has(k)) set.add(k); }
      s.mines = [...set];
    }
    const M = new Set(s.mines);
    const cnt = (k) => nb(k).filter((j) => M.has(j)).length;
    if (M.has(i)) {
      s.status = "lost"; s.boom = i; s.loser = pid; s.endedAt = Date.now();
      s.scores[pid] = (s.scores[pid] || 0) - 10; return;
    }
    let got = 0; const q = [i];
    while (q.length) { const k = q.pop(); if (s.open[k] || s.flags[k]) continue; s.open[k] = true; got++; if (cnt(k) === 0) nb(k).forEach((j) => { if (!s.open[j] && !M.has(j)) q.push(j); }); }
    s.scores[pid] = (s.scores[pid] || 0) + got;
    if (s.open.filter(Boolean).length === s.w * s.h - s.n) { s.status = "won"; s.endedAt = Date.now(); }
  },
  over: (s) => s.status !== "playing",
  view(s) {
    const M = new Set(s.mines || []);
    const nbc = (k) => { const x = k % s.w, y = (k / s.w) | 0; let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < s.w && Y < s.h && M.has(Y * s.w + X)) c++; } return c; };
    const end = s.status !== "playing";
    // -1 rejtett, 0-8 szám, 9 akna (csak a végén), 10 a felrobbant akna
    const cells = s.open.map((o, k) => (k === s.boom ? 10 : o ? nbc(k) : end && M.has(k) ? 9 : -1));
    return { w: s.w, h: s.h, n: s.n, size: s.size, cells, flags: s.flags, status: s.status, scores: s.scores, loser: s.loser, startedAt: s.startedAt, endedAt: s.endedAt, left: s.n - Object.keys(s.flags).length };
  },
};

// ---------------- Passziánsz-verseny (Klondike, ugyanaz a leosztás) ----------------
const solitaire = {
  id: "solitaire", name: "Passziánsz-verseny", min: 1,
  create(room, opts) {
    return { seed: rnd(2 ** 31), draw: opts.draw === 3 ? 3 : 1, prog: {}, startedAt: Date.now() };
  },
  act(s, pid, m) {
    const p = s.prog[pid] || (s.prog[pid] = { found: 0, moves: 0, done: 0, gaveUp: false });
    if (m.a === "progress") {
      if (p.done) return;
      p.found = Math.max(0, Math.min(52, m.found | 0)); p.moves = Math.max(0, m.moves | 0);
      if (p.found === 52) p.done = Date.now();
    } else if (m.a === "giveup") p.gaveUp = true;
  },
  view(s) { return { seed: s.seed, draw: s.draw, prog: s.prog, startedAt: s.startedAt }; },
};

// ---------------- Barkóba ----------------
const ANSWERS = ["igen", "nem", "talán", "nem tudom", "részben"];
const barkoba = {
  id: "barkoba", name: "Barkóba", min: 2,
  create(room, opts, pid) {
    const t = opts.thinker && room.players[opts.thinker] ? opts.thinker : pid;
    return { thinker: t, secret: "", hint: "", phase: "setup", qs: [], max: Math.min(40, Math.max(5, opts.max | 0 || 20)), winner: null };
  },
  act(s, pid, m) {
    if (m.a === "secret") {
      if (pid !== s.thinker || s.phase !== "setup") err("Most nem adhatod meg.");
      const sec = clean(m.secret, 60); if (!sec) err("Írd be, mire gondolsz.");
      s.secret = sec; s.hint = clean(m.hint, 40); s.phase = "play"; return;
    }
    if (s.phase !== "play") err("Még nincs feladvány.");
    if (m.a === "ask" || m.a === "guess") {
      if (pid === s.thinker) err("Te gondoltál rá, te válaszolsz.");
      const text = clean(m.text, 120); if (!text) return;
      if (s.qs.filter((q) => q.kind === "ask").length >= s.max && m.a === "ask") err("Elfogyott a kérdés, már csak tippelni lehet.");
      s.qs.push({ id: s.qs.length + 1, pid, kind: m.a, text, ans: null }); return;
    }
    if (m.a === "answer") {
      if (pid !== s.thinker) err("Csak a gondoló válaszolhat.");
      const q = s.qs.find((x) => x.id === m.id); if (!q || q.ans) return;
      if (q.kind === "guess") {
        q.ans = m.ans === "talált" ? "talált" : "nem";
        if (q.ans === "talált") { s.phase = "done"; s.winner = q.pid; }
      } else if (ANSWERS.includes(m.ans)) q.ans = m.ans;
      return;
    }
    if (m.a === "giveup") {
      if (pid !== s.thinker) err("Csak a gondoló fedheti fel.");
      s.phase = "done"; s.winner = s.thinker; return;
    }
  },
  over: (s) => s.phase === "done",
  view(s, pid) {
    const asks = s.qs.filter((q) => q.kind === "ask").length;
    return { thinker: s.thinker, phase: s.phase, hint: s.hint, qs: s.qs.slice(-80), max: s.max, asks, winner: s.winner,
      secret: s.phase === "done" || pid === s.thinker ? s.secret : null };
  },
};

// ---------------- Amőba (15×15, ötös) ----------------
const amoba = {
  id: "amoba", name: "Amőba", min: 2,
  create(room, opts, pid) {
    return { n: 15, b: new Array(225).fill(0), seats: { 1: pid, 2: null }, turn: 1, winner: 0, line: [], last: -1, wins: {} };
  },
  act(s, pid, m) {
    if (m.a === "sit") { const k = m.seat === 2 ? 2 : 1; if (!s.seats[k]) { if (s.seats[1] === pid) s.seats[1] = null; if (s.seats[2] === pid) s.seats[2] = null; s.seats[k] = pid; } return; }
    if (m.a === "leave") { if (s.seats[1] === pid) s.seats[1] = null; if (s.seats[2] === pid) s.seats[2] = null; return; }
    if (m.a === "again") {
      if (s.seats[1] !== pid && s.seats[2] !== pid) err("Csak a játékosok kezdhetnek újat.");
      s.b.fill(0); s.winner = 0; s.line = []; s.last = -1; const a = s.seats[1]; s.seats[1] = s.seats[2]; s.seats[2] = a; s.turn = 1; return;
    }
    if (m.a !== "put") return;
    if (s.winner) err("Vége, kezdjetek újat.");
    if (!s.seats[1] || !s.seats[2]) err("Kell két játékos (X és O).");
    if (s.seats[s.turn] !== pid) err("Nem te jössz.");
    const i = m.i | 0; if (i < 0 || i >= 225 || s.b[i]) return;
    s.b[i] = s.turn; s.last = i;
    const x0 = i % 15, y0 = (i / 15) | 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line = [i];
      for (const sg of [1, -1]) { let x = x0 + dx * sg, y = y0 + dy * sg; while (x >= 0 && y >= 0 && x < 15 && y < 15 && s.b[y * 15 + x] === s.turn) { line.push(y * 15 + x); x += dx * sg; y += dy * sg; } }
      if (line.length >= 5) { s.winner = s.turn; s.line = line; s.wins[pid] = (s.wins[pid] || 0) + 1; return; }
    }
    if (s.b.every(Boolean)) { s.winner = 3; return; }
    s.turn = s.turn === 1 ? 2 : 1;
  },
  view(s) { return { b: s.b, seats: s.seats, turn: s.turn, winner: s.winner, line: s.line, last: s.last, wins: s.wins }; },
};

// ---------------- Akasztófa ----------------
export const HU_LETTERS = "AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ".split("");
const hangman = {
  id: "hangman", name: "Akasztófa", min: 2,
  create(room, opts, pid) { return { setter: pid, word: "", hint: "", phase: "setup", tried: [], wrong: 0, max: 10, by: {}, winner: null, solver: null }; },
  act(s, pid, m) {
    if (m.a === "word") {
      if (pid !== s.setter || s.phase !== "setup") err("Most nem adhatod meg.");
      const w = clean(m.word, 40).toUpperCase().replace(/\s+/g, " ");
      if (!w || ![...w].some((c) => HU_LETTERS.includes(c))) err("Adj meg egy szót vagy kifejezést.");
      if ([...w].some((c) => !HU_LETTERS.includes(c) && !" -".includes(c))) err("Csak betű, szóköz és kötőjel lehet benne.");
      s.word = w; s.hint = clean(m.hint, 40); s.phase = "play"; return;
    }
    if (s.phase !== "play") err("Most nem lehet tippelni.");
    if (pid === s.setter) err("Te adtad fel, te nem tippelhetsz.");
    if (m.a === "letter") {
      const L = String(m.l || "").toUpperCase(); if (!HU_LETTERS.includes(L) || s.tried.includes(L)) return;
      s.tried.push(L);
      if (s.word.includes(L)) s.by[pid] = (s.by[pid] || 0) + [...s.word].filter((c) => c === L).length; else s.wrong++;
    } else if (m.a === "solve") {
      const g = clean(m.text, 40).toUpperCase().replace(/\s+/g, " ");
      if (!g) return;
      if (g === s.word) { s.phase = "done"; s.winner = "guessers"; s.solver = pid; return; }
      s.wrong = Math.min(s.max, s.wrong + 2);
    }
    const left = [...s.word].filter((c) => HU_LETTERS.includes(c) && !s.tried.includes(c));
    if (!left.length) { s.phase = "done"; s.winner = "guessers"; }
    else if (s.wrong >= s.max) { s.phase = "done"; s.winner = "setter"; }
  },
  over: (s) => s.phase === "done",
  view(s, pid) {
    const show = s.phase === "done" || pid === s.setter;
    const masked = [...s.word].map((c) => (!HU_LETTERS.includes(c) ? c : show || s.tried.includes(c) ? c : "_"));
    return { setter: s.setter, phase: s.phase, hint: s.hint, masked, tried: s.tried, wrong: s.wrong, max: s.max, by: s.by, winner: s.winner, solver: s.solver };
  },
};

import { MORE } from "./more.mjs";
export const GAMES = { mines, solitaire, barkoba, amoba, hangman, ...MORE };
