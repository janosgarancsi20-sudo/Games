// Klondike passziánsz – a leosztás a szerver által adott seedből jön, így mindenkinek ugyanaz.
// Koppintás: kijelölés, majd koppintás a cél oszlopra. Dupla koppintás: fel az alapra, ha lehet.
import { S, act, esc, avatar, pname, now } from "./app.js";
const $ = (s, r = document) => r.querySelector(s);
const SUITS = ["♠", "♥", "♦", "♣"], RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const red = (c) => c.s === 1 || c.s === 2;

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function deal(seed) {
  const r = rng(seed), deck = [];
  for (let s = 0; s < 4; s++) for (let v = 1; v <= 13; v++) deck.push({ s, v, up: false });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const tab = [[], [], [], [], [], [], []];
  for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) tab[j].push(deck.pop());
  tab.forEach((p) => (p[p.length - 1].up = true));
  return { tab, stock: deck, waste: [], found: [[], [], [], []], moves: 0, history: [] };
}

let G = null, gameKey = null, sel = null, lastTap = { k: "", t: 0 };
const snap = () => JSON.stringify({ tab: G.tab, stock: G.stock, waste: G.waste, found: G.found });
function push() { G.history.push(snap()); if (G.history.length > 60) G.history.shift(); }
const foundCount = () => G.found.reduce((n, f) => n + f.length, 0);
function report() { act({ a: "progress", found: foundCount(), moves: G.moves }); try { sessionStorage.setItem("sol:" + gameKey, JSON.stringify({ ...JSON.parse(snap()), moves: G.moves })); } catch {} }

const canFound = (c, f) => (f.length ? f[f.length - 1].s === c.s && f[f.length - 1].v === c.v - 1 : c.v === 1);
const canTab = (c, p) => (p.length ? p[p.length - 1].up && red(p[p.length - 1]) !== red(c) && p[p.length - 1].v === c.v + 1 : c.v === 13);

// kijelölés: {from:'w'} | {from:'t', p, i} | {from:'f', p}
function cardsOf(x) { if (x.from === "w") return G.waste.slice(-1); if (x.from === "f") return G.found[x.p].slice(-1); return G.tab[x.p].slice(x.i); }
function take(x) { if (x.from === "w") G.waste.pop(); else if (x.from === "f") G.found[x.p].pop(); else { G.tab[x.p].splice(x.i); const p = G.tab[x.p]; if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true; } }
function tryMove(x, to) {
  const cs = cardsOf(x); if (!cs.length) return false;
  if (to.k === "f") { if (cs.length !== 1 || !canFound(cs[0], G.found[to.p])) return false; push(); take(x); G.found[to.p].push(cs[0]); }
  else { if (x.from === "t" && x.p === to.p) return false; if (!canTab(cs[0], G.tab[to.p])) return false; push(); take(x); G.tab[to.p].push(...cs); }
  G.moves++; return true;
}
function autoFound(x) { const cs = cardsOf(x); if (cs.length !== 1) return false; for (let f = 0; f < 4; f++) if (canFound(cs[0], G.found[f])) return tryMove(x, { k: "f", p: f }); return false; }
function autoAll() {
  let moved = true, any = false;
  while (moved) { moved = false;
    if (G.waste.length && autoFound({ from: "w" })) moved = any = true;
    for (let p = 0; p < 7; p++) if (G.tab[p].length && autoFound({ from: "t", p, i: G.tab[p].length - 1 })) moved = any = true; }
  return any;
}
function draw() {
  push();
  if (!G.stock.length) { G.stock = G.waste.reverse().map((c) => ({ ...c, up: false })); G.waste = []; }
  else { const n = Math.min(S.st.game.v.draw, G.stock.length); for (let i = 0; i < n; i++) { const c = G.stock.pop(); c.up = true; G.waste.push(c); } }
  G.moves++;
}

function cardHTML(c, extra = "", style = "", on = false) {
  if (!c.up) return `<div class="pc back" style="${style}" ${extra}></div>`;
  const r = RANKS[c.v - 1], s = SUITS[c.s];
  return `<div class="pc ${red(c) ? "r" : ""} ${on ? "sel" : ""}" style="${style}" ${extra}><span>${r}${s}</span><span class="big">${s}</span></div>`;
}
function draw_board(el) {
  const isSel = (x) => sel && sel.from === x.from && sel.p === x.p && (x.from !== "t" || x.i >= sel.i);
  const top = `
    <div class="pile" data-z="stock">${G.stock.length ? cardHTML({ up: false }) : `<div class="fl" style="height:100%">↺</div>`}</div>
    <div class="pile" data-z="waste" style="border-color:transparent">${G.waste.slice(-1).map((c) => cardHTML(c, `data-z="waste"`, "", !!(sel && sel.from === "w"))).join("")}</div>
    <div></div>
    ${G.found.map((f, i) => `<div class="pile" data-z="f" data-p="${i}">${f.length ? cardHTML(f[f.length - 1], `data-z="f" data-p="${i}"`, "", isSel({ from: "f", p: i })) : `<div class="fl" style="height:100%">${SUITS[i]}</div>`}</div>`).join("")}`;
  const tabs = G.tab.map((p, pi) => {
    let y = 0;
    const cards = p.map((c, ci) => { const st = `top:${y}px`; y += c.up ? 24 : 10; return cardHTML(c, c.up ? `data-z="t" data-p="${pi}" data-i="${ci}"` : "", st, c.up && isSel({ from: "t", p: pi, i: ci })); }).join("");
    return `<div class="pile tab" data-z="t" data-p="${pi}" data-i="${p.length}" style="height:calc(var(--ch) + ${Math.max(0, y - (p.length && p[p.length - 1].up ? 24 : 10))}px)">${cards}</div>`;
  }).join("");
  $("#sboard", el).innerHTML = `<div class="srow">${top}</div><div class="srow">${tabs}</div>`;
  $("#smoves", el).textContent = G.moves;
  $("#sfound", el).textContent = foundCount();
}

export const solitaire = {
  mount(el, v) {
    const key = v.seed + ":" + S.st.game.startedAt;
    if (gameKey !== key) {
      gameKey = key; sel = null; G = deal(v.seed);
      try { const s = JSON.parse(sessionStorage.getItem("sol:" + key)); if (s) Object.assign(G, s, { history: [] }); } catch {}
    }
    el.innerHTML = `
      <div class="mbar"><span class="pill">Felrakva <b id="sfound"></b>/52</span><span class="pill">Lépés <b id="smoves"></b></span><span class="pill">⏱ <b id="stime"></b></span></div>
      <div id="swin"></div>
      <div class="sol" id="sboard"></div>
      <div class="row" style="justify-content:center"><button class="ghost" data-s="undo">↶ Vissza</button><button class="ghost" data-s="auto">Mindent fel az alapra</button></div>
      <p class="small muted" style="text-align:center">Koppints egy lapra, aztán oda, ahová tennéd. Dupla koppintással felmegy az alapra.</p>
      <div class="card"><div class="eyebrow" style="margin-bottom:8px">Verseny</div><div class="race" id="srace"></div></div>`;
    el.addEventListener("click", (e) => {
      const sb = e.target.closest("[data-s]");
      if (sb) { if (sb.dataset.s === "undo" && G.history.length) { Object.assign(G, JSON.parse(G.history.pop())); G.moves++; sel = null; } if (sb.dataset.s === "auto" && autoAll()) report(); draw_board(el); return; }
      const z = e.target.closest("[data-z]"); if (!z || !$("#sboard", el).contains(z)) return;
      const k = z.dataset.z, p = +z.dataset.p, i = +z.dataset.i;
      const tapKey = k + p + i, t = Date.now(), dbl = lastTap.k === tapKey && t - lastTap.t < 350; lastTap = { k: tapKey, t };
      if (k === "stock") { draw(); sel = null; report(); return draw_board(el); }
      const here = k === "waste" ? { from: "w" } : k === "f" ? { from: "f", p } : { from: "t", p, i };
      if (dbl && (k === "waste" || (k === "t" && i === G.tab[p].length - 1))) { if (autoFound(here)) { sel = null; report(); return draw_board(el); } }
      if (sel) {
        const to = k === "f" ? { k: "f", p } : k === "t" ? { k: "t", p } : null;
        if (to && tryMove(sel, to)) { sel = null; report(); return draw_board(el); }
      }
      const has = k === "waste" ? G.waste.length : k === "f" ? G.found[p].length : G.tab[p][i] && G.tab[p][i].up;
      sel = has && !(sel && sel.from === here.from && sel.p === here.p && sel.i === here.i) ? here : null;
      draw_board(el);
    });
    draw_board(el);
    clearInterval(solitaire._t); solitaire._t = setInterval(() => { const g = S.st?.game; if (!g || g.type !== "solitaire") return clearInterval(solitaire._t); const me = g.v.prog[S.pid]; const tEl = $("#stime"); if (tEl) { const ms = (me && me.done ? me.done : now()) - g.v.startedAt; const s = Math.floor(ms / 1000); tEl.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); } }, 500);
    report();
  },
  paint(el, v) {
    const ids = Object.keys(S.st.players).filter((p) => v.prog[p]).sort((a, b) => { const A = v.prog[a], B = v.prog[b]; if (A.done && B.done) return A.done - B.done; if (A.done) return -1; if (B.done) return 1; return B.found - A.found; });
    const html = ids.map((p, n) => { const q = v.prog[p]; return `<div class="r">${avatar(p, true)}<span style="min-width:70px">${esc(pname(p))}</span><span class="bar"><i style="width:${(q.found / 52) * 100}%"></i></span><span style="min-width:64px;text-align:right">${q.done ? "🏁 " + fmtT(q.done - v.startedAt) : q.found + "/52"}</span></div>`; }).join("");
    const r = $("#srace", el); if (r && r.innerHTML !== html) r.innerHTML = html;
    const winner = ids.find((p) => v.prog[p].done);
    const w = winner ? `<div class="notice ok"><div class="body"><b>${esc(pname(winner))}</b> nyert! ${winner === S.pid ? "Gratulálok!" : ""}</div></div>` : "";
    const we = $("#swin", el); if (we && we.innerHTML !== w) we.innerHTML = w;
  },
};
const fmtT = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
