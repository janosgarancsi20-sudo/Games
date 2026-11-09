// 9 további játék. A tick(st, now, room) függvényt a szerver másodpercenként hívja; ha true-t ad, frissít mindenkit.
import crypto from "node:crypto";
import { DRAW_WORDS, QUIZ } from "./data.mjs";
import { orszag } from "./orszag.mjs";

const rnd = (n) => crypto.randomInt(n);
const err = (m) => { throw new Error(m); };
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Jelenlét: online ember vagy gépi játékos. A rajzolóst csak emberek játsszák.
export const isIn = (room, p) => !!room.players[p] && (room.socks.has(p) || !!room.players[p].bot);
const online = (room) => Object.keys(room.players).filter((p) => isIn(room, p));
const humans = (room) => [...room.socks.keys()].filter((p) => room.players[p]);
const add = (o, k, v) => (o[k] = (o[k] || 0) + v);

// ================= Rajzolós találgatós =================
const DRAW_TIME = 80000;
const draw = {
  id: "draw", name: "Rajzolós", min: 2,
  create(room, opts) {
    const order = shuffle(humans(room));
    const s = { order, turn: -1, laps: Math.max(1, Math.min(3, opts.laps | 0 || 1)), scores: {}, phase: "pick", drawer: null, choices: [], word: "", strokes: [], guessed: {}, feed: [], endsAt: 0, used: [], hintAt: 0, last: null, done: false };
    nextTurn(s); return s;
  },
  act(s, pid, m) {
    if (m.a === "pick") { if (pid !== s.drawer || s.phase !== "pick") return; const w = s.choices[m.i | 0]; if (!w) return; s.word = w; s.phase = "draw"; s.endsAt = Date.now() + DRAW_TIME; s.strokes = []; s.guessed = {}; return; }
    if (m.a === "stroke") {
      if (pid !== s.drawer || s.phase !== "draw") return;
      const pts = Array.isArray(m.pts) ? m.pts.slice(0, 200).map((p) => [Math.round(+p[0] * 1000) / 1000, Math.round(+p[1] * 1000) / 1000]).filter((p) => p.every((v) => v >= 0 && v <= 1)) : [];
      if (!pts.length) return;
      const st = { id: m.id | 0, c: /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : "#111111", w: Math.max(1, Math.min(40, m.w | 0 || 4)), pts };
      const prev = s.strokes.find((x) => x.id === st.id); // folytatott vonal
      if (prev) prev.pts.push(...pts); else s.strokes.push(st);
      if (s.strokes.reduce((n, x) => n + x.pts.length, 0) > 6000) s.strokes.shift();
      return;
    }
    if (m.a === "undo") { if (pid === s.drawer) s.strokes.pop(); return; }
    if (m.a === "clear") { if (pid === s.drawer) s.strokes = []; return; }
    if (m.a === "guess") {
      if (s.phase !== "draw" || pid === s.drawer || s.guessed[pid]) return;
      const t = clean(m.text, 40); if (!t) return;
      if (norm(t) === norm(s.word)) {
        const n = Object.keys(s.guessed).length;
        const left = Math.max(0, s.endsAt - Date.now()) / DRAW_TIME;
        const pts = Math.max(20, Math.round(100 * left)) + Math.max(0, 30 - n * 10);
        s.guessed[pid] = pts; add(s.scores, pid, pts); add(s.scores, s.drawer, 25);
        s.feed.push({ pid, ok: true });
      } else s.feed.push({ pid, text: t, close: lev(norm(t), norm(s.word)) === 1 });
      s.feed = s.feed.slice(-40);
    }
  },
  tick(s, now, room) {
    if (s.done) return false;
    if (s.phase === "draw") {
      const guessers = s.order.filter((p) => p !== s.drawer && room.socks.has(p));
      if (now >= s.endsAt || (guessers.length && guessers.every((p) => s.guessed[p]))) { s.phase = "reveal"; s.last = { word: s.word, drawer: s.drawer }; s.endsAt = now + 4000; return true; }
      return false;
    }
    if (s.phase === "reveal" && now >= s.endsAt) { nextTurn(s, room); return true; }
    if (s.phase === "pick" && s.drawer && room && !room.socks.has(s.drawer)) { nextTurn(s, room); return true; }
    return false;
  },
  over: (s) => s.done,
  view(s, pid) {
    const showWord = pid === s.drawer || s.guessed[pid] || s.phase !== "draw";
    const hint = s.word ? [...s.word].map((c, i) => (c === " " ? " " : showWord || (s.endsAt - Date.now() < DRAW_TIME / 3 && i === 0) ? c : "_")).join("") : "";
    return { phase: s.phase, drawer: s.drawer, choices: pid === s.drawer && s.phase === "pick" ? s.choices : null, hint, len: s.word.length, word: showWord ? s.word : null,
      strokes: s.strokes, guessed: s.guessed, feed: s.feed.slice(-20), endsAt: s.endsAt, scores: s.scores, turn: s.turn, total: s.order.length * s.laps, last: s.last, done: s.done };
  },
};
function nextTurn(s, room) {
  for (;;) {
    s.turn++;
    if (s.turn >= s.order.length * s.laps) { s.done = true; s.phase = "done"; return; }
    const d = s.order[s.turn % s.order.length];
    if (!room || room.socks.has(d)) { s.drawer = d; break; }
  }
  const pool = DRAW_WORDS.filter((w) => !s.used.includes(w));
  s.choices = shuffle(pool).slice(0, 3); s.used.push(...s.choices);
  s.phase = "pick"; s.word = ""; s.strokes = []; s.guessed = {}; s.feed = []; s.endsAt = 0;
}
function lev(a, b) { if (Math.abs(a.length - b.length) > 1) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }

// ================= Kvíz =================
const Q_TIME = 15000;
const quiz = {
  id: "quiz", name: "Kvíz", min: 1,
  create(room, opts) {
    const n = [5, 10, 15].includes(opts.n) ? opts.n : 10;
    const qs = shuffle(QUIZ).slice(0, n).map(([q, a]) => { const order = shuffle([0, 1, 2, 3]); return { q, opts: order.map((i) => a[i]), correct: order.indexOf(0) }; });
    return { qs, i: 0, phase: "q", endsAt: Date.now() + Q_TIME + 2000, startAt: Date.now() + 2000, answers: {}, scores: {}, gain: {} };
  },
  act(s, pid, m, room) {
    if (m.a !== "answer" || s.phase !== "q") return;
    const t = Date.now(); if (t < s.startAt || t > s.endsAt || s.answers[pid] != null) return;
    const c = m.c | 0; if (c < 0 || c > 3) return;
    s.answers[pid] = c;
    if (c === s.qs[s.i].correct) { const g = 500 + Math.round(500 * (s.endsAt - t) / Q_TIME); s.gain[pid] = g; add(s.scores, pid, g); } else s.gain[pid] = 0;
    if (online(room).every((p) => s.answers[p] != null)) { s.phase = "reveal"; s.endsAt = t + 3500; }
  },
  tick(s, now) {
    if (s.phase === "q" && now > s.endsAt) { s.phase = "reveal"; s.endsAt = now + 3500; return true; }
    if (s.phase === "reveal" && now > s.endsAt) {
      if (s.i + 1 >= s.qs.length) { s.phase = "done"; return true; }
      s.i++; s.phase = "q"; s.answers = {}; s.gain = {}; s.startAt = now + 1000; s.endsAt = now + 1000 + Q_TIME; return true;
    }
    return false;
  },
  over: (s) => s.phase === "done",
  view(s, pid) {
    const q = s.qs[s.i];
    return { i: s.i, n: s.qs.length, phase: s.phase, q: q.q, opts: q.opts, correct: s.phase === "q" ? null : q.correct, mine: s.answers[pid] ?? null, answered: Object.keys(s.answers), answers: s.phase === "q" ? null : s.answers, gain: s.phase === "q" ? null : s.gain, endsAt: s.endsAt, startAt: s.startAt, scores: s.scores };
  },
};

// ================= Négy a sorban =================
const four = {
  id: "four", name: "Négy a sorban", min: 2,
  create(room, opts, pid) { return { b: new Array(42).fill(0), seats: { 1: pid, 2: null }, turn: 1, winner: 0, line: [], last: -1, wins: {} }; },
  act(s, pid, m) {
    if (m.a === "sit") { const k = m.seat === 2 ? 2 : 1; if (!s.seats[k]) { if (s.seats[1] === pid) s.seats[1] = null; if (s.seats[2] === pid) s.seats[2] = null; s.seats[k] = pid; } return; }
    if (m.a === "leave") { if (s.seats[1] === pid) s.seats[1] = null; if (s.seats[2] === pid) s.seats[2] = null; return; }
    if (m.a === "again") { if (s.seats[1] !== pid && s.seats[2] !== pid) err("Csak a játékosok kezdhetnek újat."); s.b.fill(0); s.winner = 0; s.line = []; s.last = -1; [s.seats[1], s.seats[2]] = [s.seats[2], s.seats[1]]; s.turn = 1; return; }
    if (m.a !== "drop") return;
    if (s.winner) err("Vége, kezdjetek újat.");
    if (!s.seats[1] || !s.seats[2]) err("Kell két játékos.");
    if (s.seats[s.turn] !== pid) err("Nem te jössz.");
    const col = m.col | 0; if (col < 0 || col > 6) return;
    let row = -1; for (let r = 5; r >= 0; r--) if (!s.b[r * 7 + col]) { row = r; break; }
    if (row < 0) err("Ez az oszlop tele van.");
    const i = row * 7 + col; s.b[i] = s.turn; s.last = i;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line = [i];
      for (const sg of [1, -1]) { let x = col + dx * sg, y = row + dy * sg; while (x >= 0 && y >= 0 && x < 7 && y < 6 && s.b[y * 7 + x] === s.turn) { line.push(y * 7 + x); x += dx * sg; y += dy * sg; } }
      if (line.length >= 4) { s.winner = s.turn; s.line = line; add(s.wins, pid, 1); return; }
    }
    if (s.b.every(Boolean)) { s.winner = 3; return; }
    s.turn = s.turn === 1 ? 2 : 1;
  },
  view(s) { return { b: s.b, seats: s.seats, turn: s.turn, winner: s.winner, line: s.line, last: s.last, wins: s.wins }; },
};

// ================= Torpedó =================
const SHIPS = [4, 3, 3, 2, 2];
function placeShips() {
  for (;;) {
    const g = new Array(64).fill(0), ships = []; let ok = true;
    for (const len of SHIPS) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const h = rnd(2) === 0, x = rnd(h ? 9 - len : 8), y = rnd(h ? 8 : 9 - len);
        const cells = Array.from({ length: len }, (_, k) => (h ? y * 8 + x + k : (y + k) * 8 + x));
        const near = (c) => { const cx = c % 8, cy = (c / 8) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < 8 && Y < 8 && g[Y * 8 + X]) return true; } return false; };
        if (cells.some(near)) continue;
        cells.forEach((c) => (g[c] = ships.length + 1)); ships.push(cells); placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}
const battle = {
  id: "battle", name: "Torpedó", min: 2,
  create(room, opts, pid) { return { seats: { 1: pid, 2: null }, ships: { 1: placeShips(), 2: placeShips() }, shots: { 1: [], 2: [] }, ready: { 1: false, 2: false }, turn: 1, winner: 0 }; },
  act(s, pid, m) {
    const me = s.seats[1] === pid ? 1 : s.seats[2] === pid ? 2 : 0;
    if (m.a === "sit") { const k = m.seat === 2 ? 2 : 1; if (!s.seats[k] && !me) s.seats[k] = pid; return; }
    if (m.a === "again") { if (!me) return; Object.assign(s, { ships: { 1: placeShips(), 2: placeShips() }, shots: { 1: [], 2: [] }, ready: { 1: false, 2: false }, turn: s.winner === 1 ? 2 : 1, winner: 0 }); return; }
    if (!me) err("Ülj le, ha játszani szeretnél.");
    if (m.a === "shuffle") { if (s.ready[me]) return; s.ships[me] = placeShips(); return; }
    if (m.a === "ready") { s.ready[me] = true; return; }
    if (m.a !== "shoot") return;
    if (s.winner) return;
    if (!s.ready[1] || !s.ready[2]) err("Mindkét játékosnak készen kell állnia.");
    if (s.turn !== me) err("Nem te jössz.");
    const i = m.i | 0, foe = me === 1 ? 2 : 1; if (i < 0 || i > 63 || s.shots[me].includes(i)) return;
    s.shots[me].push(i);
    const hit = s.ships[foe].some((sh) => sh.includes(i));
    if (s.ships[foe].every((sh) => sh.every((c) => s.shots[me].includes(c)))) { s.winner = me; return; }
    if (!hit) s.turn = foe;
  },
  view(s, pid) {
    const me = s.seats[1] === pid ? 1 : s.seats[2] === pid ? 2 : 0;
    const board = (owner, viewer) => { // a viewer szemszögéből owner táblája
      const shotsAt = s.shots[owner === 1 ? 2 : 1];
      return Array.from({ length: 64 }, (_, i) => {
        const ship = s.ships[owner].findIndex((sh) => sh.includes(i));
        const shot = shotsAt.includes(i);
        const sunk = ship >= 0 && s.ships[owner][ship].every((c) => shotsAt.includes(c));
        if (shot) return ship >= 0 ? (sunk ? 4 : 3) : 2; // 2 mellé, 3 talált, 4 elsüllyedt
        return ship >= 0 && (viewer === owner || s.winner) ? 1 : 0;
      });
    };
    const left = (o) => s.ships[o].filter((sh) => !sh.every((c) => s.shots[o === 1 ? 2 : 1].includes(c))).length;
    return { seats: s.seats, ready: s.ready, turn: s.turn, winner: s.winner, me, b1: board(1, me), b2: board(2, me), left: { 1: left(1), 2: left(2) } };
  },
};

// ================= Memória =================
const EMO = ["🍎", "🐶", "🚗", "⚽", "🌵", "🎸", "🍕", "🐱", "🚀", "🌈", "🦁", "🍩", "🎈", "🐸", "⭐", "🍉", "🦄", "🐙"];
const memory = {
  id: "memory", name: "Memória", min: 1,
  create(room, opts) {
    const pairs = [8, 10, 12].includes(opts.pairs) ? opts.pairs : 10;
    const deck = shuffle(shuffle(EMO).slice(0, pairs).flatMap((e) => [e, e]));
    return { deck, found: {}, open: [], order: shuffle(online(room)), t: 0, scores: {}, hideAt: 0, done: false };
  },
  act(s, pid, m, room) {
    if (m.a !== "flip" || s.done || s.hideAt) return;
    const cur = s.order[s.t % s.order.length];
    if (cur !== pid) err("Nem te jössz.");
    const i = m.i | 0; if (i < 0 || i >= s.deck.length || s.found[i] || s.open.includes(i)) return;
    s.open.push(i);
    if (s.open.length === 2) {
      const [a, b] = s.open;
      if (s.deck[a] === s.deck[b]) { s.found[a] = s.found[b] = pid; add(s.scores, pid, 1); s.open = []; if (Object.keys(s.found).length === s.deck.length) s.done = true; }
      else s.hideAt = Date.now() + 1300;
    }
  },
  tick(s, now, room) {
    let ch = false;
    if (s.hideAt && now > s.hideAt) { s.open = []; s.hideAt = 0; s.t++; ch = true; }
    // ha a soron lévő játékos elment, lépjünk tovább
    if (!s.done && s.order.length && !isIn(room, s.order[s.t % s.order.length])) { const on = s.order.filter((p) => isIn(room, p)); if (on.length) { s.t++; ch = true; } }
    return ch;
  },
  over: (s) => s.done,
  view(s) { return { cards: s.deck.map((e, i) => (s.found[i] || s.open.includes(i) ? e : null)), found: s.found, open: s.open, cur: s.order[s.t % s.order.length], scores: s.scores, done: s.done, order: s.order }; },
};

// ================= Kockapóker (Yatzy) =================
const CATS = [
  ["ones", "Egyesek"], ["twos", "Kettesek"], ["threes", "Hármasok"], ["fours", "Négyesek"], ["fives", "Ötösök"], ["sixes", "Hatosok"],
  ["three", "Drill (3 egyforma)"], ["four", "Póker (4 egyforma)"], ["full", "Full (3+2)"], ["small", "Kis sor (4)"], ["large", "Nagy sor (5)"], ["yatzy", "Kockapóker (5 egyforma)"], ["chance", "Esély"],
];
function yScore(cat, d) {
  const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach((v) => c[v]++); const sum = d.reduce((a, b) => a + b, 0);
  const up = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }[cat];
  if (up) return c[up] * up;
  const has = (seq) => seq.every((v) => c[v] > 0);
  switch (cat) {
    case "three": return c.some((x) => x >= 3) ? sum : 0;
    case "four": return c.some((x) => x >= 4) ? sum : 0;
    case "full": return c.includes(3) && c.includes(2) ? 25 : 0;
    case "small": return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
    case "large": return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
    case "yatzy": return c.includes(5) ? 50 : 0;
    case "chance": return sum;
  }
  return 0;
}
const yTotal = (sh) => { const upper = ["ones", "twos", "threes", "fours", "fives", "sixes"].reduce((n, k) => n + (sh[k] || 0), 0); const all = Object.values(sh).reduce((a, b) => a + b, 0); return { upper, bonus: upper >= 63 ? 35 : 0, total: all + (upper >= 63 ? 35 : 0) }; };
const dice = {
  id: "dice", name: "Kockapóker", min: 1,
  create(room) { const order = shuffle(online(room)); return { order, t: 0, d: [1, 1, 1, 1, 1], hold: [false, false, false, false, false], rolls: 0, sheets: Object.fromEntries(order.map((p) => [p, {}])), done: false }; },
  act(s, pid, m, room) {
    if (s.done) return;
    const cur = s.order[s.t % s.order.length];
    if (m.a === "join") { if (!s.sheets[pid]) { s.sheets[pid] = {}; s.order.push(pid); } return; }
    if (cur !== pid) err("Nem te jössz.");
    if (m.a === "roll") { if (s.rolls >= 3) err("Már háromszor dobtál, válassz sort."); s.d = s.d.map((v, i) => (s.hold[i] && s.rolls ? v : 1 + rnd(6))); s.rolls++; return; }
    if (m.a === "hold") { if (!s.rolls) return; const i = m.i | 0; if (i >= 0 && i < 5) s.hold[i] = !s.hold[i]; return; }
    if (m.a === "score") {
      if (!s.rolls) err("Előbb dobj.");
      const k = m.cat; if (!CATS.some(([c]) => c === k) || s.sheets[pid][k] != null) return;
      s.sheets[pid][k] = yScore(k, s.d);
      s.rolls = 0; s.hold = [false, false, false, false, false];
      // következő játékos, aki még online és van üres sora
      for (let n = 0; n < s.order.length; n++) { s.t++; const p = s.order[s.t % s.order.length]; if (isIn(room, p) && Object.keys(s.sheets[p]).length < CATS.length) return; }
      s.done = true;
    }
  },
  tick(s, now, room) { if (s.done || !s.order.length) return false; const cur = s.order[s.t % s.order.length]; if (!isIn(room, cur) && s.order.some((p) => isIn(room, p) && Object.keys(s.sheets[p]).length < CATS.length)) { s.t++; s.rolls = 0; s.hold = [false, false, false, false, false]; return true; } return false; },
  over: (s) => s.done,
  view(s) {
    const cur = s.order[s.t % s.order.length];
    const preview = s.rolls ? Object.fromEntries(CATS.map(([c]) => [c, yScore(c, s.d)])) : null;
    return { cats: CATS, order: s.order, cur, d: s.d, hold: s.hold, rolls: s.rolls, sheets: s.sheets, totals: Object.fromEntries(Object.entries(s.sheets).map(([p, sh]) => [p, yTotal(sh)])), preview, done: s.done };
  },
};

// ================= Kő-papír-olló =================
const RPS = ["ko", "papir", "ollo"];
const beats = { ko: "ollo", papir: "ko", ollo: "papir" };
const rps = {
  id: "rps", name: "Kő-papír-olló", min: 2,
  create() { return { round: 1, picks: {}, phase: "pick", last: null, scores: {} }; },
  act(s, pid, m, room) {
    if (m.a === "next") { if (s.phase !== "reveal") return; s.round++; s.picks = {}; s.phase = "pick"; return; }
    if (m.a !== "pick" || s.phase !== "pick" || !RPS.includes(m.p)) return;
    s.picks[pid] = m.p;
    const on = online(room);
    if (on.length >= 2 && on.every((p) => s.picks[p])) {
      const gain = {};
      on.forEach((p) => { gain[p] = on.filter((q) => q !== p && beats[s.picks[p]] === s.picks[q]).length; add(s.scores, p, gain[p]); });
      s.last = { picks: { ...s.picks }, gain }; s.phase = "reveal";
    }
  },
  view(s, pid) { return { round: s.round, phase: s.phase, mine: s.picks[pid] || null, picked: Object.keys(s.picks), last: s.last, scores: s.scores }; },
};

// ================= Reakcióidő =================
const react = {
  id: "react", name: "Reakcióidő", min: 1,
  create() { return { round: 0, total: 5, phase: "idle", goAt: 0, times: {}, best: {}, sum: {}, falses: {}, history: [] }; },
  act(s, pid, m, room) {
    if (m.a === "go") { if (s.phase === "wait" || s.phase === "go") return; if (s.round >= s.total) { s.round = 0; s.best = {}; s.sum = {}; s.falses = {}; s.history = []; } s.round++; s.phase = "wait"; s.goAt = Date.now() + 1800 + rnd(3500); s.times = {}; return; }
    if (m.a === "tap") {
      if (s.times[pid] != null) return;
      if (s.phase === "wait") { s.times[pid] = -1; add(s.falses, pid, 1); }
      else if (s.phase === "go") { const ms = Math.max(80, Math.min(3000, m.ms | 0)); s.times[pid] = ms; add(s.sum, pid, ms); if (!s.best[pid] || ms < s.best[pid]) s.best[pid] = ms; }
      else return;
      const on = online(room);
      if (on.every((p) => s.times[p] != null) && s.phase === "go") { s.phase = "result"; s.history.push({ ...s.times }); }
    }
  },
  tick(s, now, room) {
    if (s.phase === "wait" && now >= s.goAt) { s.phase = "go"; s.goEnd = now + 3000; return true; }
    if (s.phase === "go" && now >= s.goEnd) { online(room).forEach((p) => { if (s.times[p] == null) { s.times[p] = 3000; add(s.sum, p, 3000); } }); s.phase = "result"; s.history.push({ ...s.times }); return true; }
    return false;
  },
  view(s) { return { round: s.round, total: s.total, phase: s.phase, times: s.times, best: s.best, sum: s.sum, falses: s.falses, history: s.history }; },
};

export { DRAW_WORDS };
export const MORE = { draw, orszag, quiz, four, battle, memory, dice, rps, react };
