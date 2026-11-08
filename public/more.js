import { S, act, esc, avatar, pname, now, toast } from "./app.js";
const $ = (s, r = document) => r.querySelector(s);
const setHTML = (el, h) => { if (el && el.innerHTML !== h) el.innerHTML = h; };
const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));
const scoreList = (scores, unit = "") => {
  const ids = Object.keys(scores || {}).sort((a, b) => scores[b] - scores[a]);
  return ids.length ? `<div class="people">${ids.map((p) => `<div class="person">${avatar(p)}<span class="nm">${esc(pname(p))}</span><span class="sc">${scores[p]}${unit}</span></div>`).join("")}</div>` : `<p class="muted small">Még nincs pont.</p>`;
};
const timers = {};
const loop = (name, fn) => { clearInterval(timers[name]); timers[name] = setInterval(() => { if (S.st?.game?.type !== name) return clearInterval(timers[name]); fn(S.st.game.v); }, 250); };

// ================= Rajzolós =================
const COLORS = ["#111111", "#e2334f", "#f08c00", "#ffd23f", "#16a36d", "#3d5af1", "#8b5cf6", "#8b5a2b", "#ffffff"];
let pen = { c: "#111111", w: 6 }, strokeId = 0;
function redraw(cv, strokes) {
  const x = cv.getContext("2d"), W = cv.width, H = cv.height;
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.lineCap = x.lineJoin = "round";
  for (const s of strokes) { x.strokeStyle = s.c; x.lineWidth = s.w * (W / 600); x.beginPath(); s.pts.forEach(([a, b], i) => (i ? x.lineTo(a * W, b * H) : x.moveTo(a * W, b * H))); if (s.pts.length === 1) x.lineTo(s.pts[0][0] * W + 0.1, s.pts[0][1] * H); x.stroke(); }
}
export const draw = {
  shellKey: (v) => v.phase + ":" + v.turn + ":" + (v.drawer === S.pid ? 1 : 0),
  mount(el, v) {
    const me = v.drawer === S.pid;
    if (v.phase === "done") { el.innerHTML = `<div class="card stack"><h2>Vége a menetnek!</h2>${scoreList(v.scores)}<button data-act="start" data-game="draw">Új menet</button></div>`; return; }
    if (v.phase === "pick") {
      el.innerHTML = me ? `<div class="card stack"><h3>Te rajzolsz! Válassz egy szót:</h3><div class="stack" style="gap:8px">${v.choices.map((w, i) => `<button class="big" data-dpick="${i}">${esc(w)}</button>`).join("")}</div></div>`
        : `<div class="card flat scan"><p><b>${esc(pname(v.drawer))}</b> szót választ…</p></div>${v.last ? `<div class="notice"><div class="body">Az előző szó: <b>${esc(v.last.word)}</b></div></div>` : ""}<div class="card"><div class="eyebrow" style="margin-bottom:6px">Pontok</div>${scoreList(v.scores)}</div>`;
      el.addEventListener("click", (e) => { const b = e.target.closest("[data-dpick]"); if (b) act({ a: "pick", i: +b.dataset.dpick }); });
      return;
    }
    el.innerHTML = `
      <div class="mbar"><span class="pill">${v.turn + 1}/${v.total}. kör</span><span class="pill" id="dword" style="letter-spacing:.18em;font-family:var(--display);font-weight:800"></span><span class="pill">⏱ <b id="dtime"></b></span></div>
      <div id="dstat"></div>
      <canvas id="dcv" width="600" height="600" style="width:100%;aspect-ratio:1;border-radius:16px;background:#fff;touch-action:none;display:block"></canvas>
      ${me && v.phase === "draw" ? `<div class="row" style="gap:6px;justify-content:center">${COLORS.map((c) => `<button data-dcol="${c}" aria-label="szín" style="width:34px;height:34px;padding:0;border-radius:50%;background:${c};border:3px solid ${c === pen.c ? "var(--accent)" : "var(--line)"}"></button>`).join("")}</div>
        <div class="row" style="justify-content:center"><div class="seg">${[[3, "Vékony"], [6, "Közepes"], [14, "Vastag"], [30, "Radír"]].map(([w, l]) => `<button data-dw="${w}" class="${pen.w === w ? "on" : ""}">${l}</button>`).join("")}</div><button class="ghost" data-dundo>↶</button><button class="ghost" data-dclear>Töröl</button></div>`
      : v.phase === "draw" ? `<form class="addrow" data-dguess><input type="text" id="dg" class="grow" maxlength="40" placeholder="Mit rajzol? Írd be!" autocomplete="off" enterkeyhint="send"><button>Tipp</button></form>` : ""}
      <div class="card"><div class="eyebrow" style="margin-bottom:6px">Tippek</div><div class="qlist" id="dfeed"></div></div>
      <div class="card"><div class="eyebrow" style="margin-bottom:6px">Pontok</div><div id="dscore"></div></div>`;
    const cv = $("#dcv", el); redraw(cv, v.strokes);
    if (me && v.phase === "draw") {
      let cur = null, buf = [], flushT = null;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
      const send = () => { if (cur && buf.length) { act({ a: "stroke", id: cur.id, c: cur.c, w: cur.w, pts: buf }); buf = []; } };
      cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); const c = pen.w === 30 ? "#ffffff" : pen.c; cur = { id: ++strokeId + Date.now() % 100000 * 10, c, w: pen.w, pts: [pos(e)] }; buf = [pos(e)]; local.push(cur); redraw(cv, local); flushT = setInterval(send, 120); });
      cv.addEventListener("pointermove", (e) => { if (!cur) return; const p = pos(e); cur.pts.push(p); buf.push(p); redraw(cv, local); });
      const end = () => { if (!cur) return; send(); clearInterval(flushT); cur = null; };
      cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
      let local = v.strokes.map((s) => ({ ...s, pts: s.pts.slice() }));
      draw._local = () => local; draw._setLocal = (s) => { if (!cur) local = s.map((x) => ({ ...x, pts: x.pts.slice() })); };
    } else draw._local = null;
    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-dcol]"); if (c) { pen.c = c.dataset.dcol; if (pen.w === 30) pen.w = 6; el.querySelectorAll("[data-dcol]").forEach((b) => (b.style.borderColor = b.dataset.dcol === pen.c ? "var(--accent)" : "var(--line)")); el.querySelectorAll("[data-dw]").forEach((b) => b.classList.toggle("on", +b.dataset.dw === pen.w)); return; }
      const w = e.target.closest("[data-dw]"); if (w) { pen.w = +w.dataset.dw; el.querySelectorAll("[data-dw]").forEach((b) => b.classList.toggle("on", b === w)); return; }
      if (e.target.closest("[data-dundo]")) act({ a: "undo" });
      if (e.target.closest("[data-dclear]")) act({ a: "clear" });
    });
    el.addEventListener("submit", (e) => { if (!e.target.closest("[data-dguess]")) return; e.preventDefault(); const i = $("#dg"); if (i.value.trim()) { act({ a: "guess", text: i.value }); i.value = ""; } });
    loop("draw", (vv) => { const t = $("#dtime"); if (t) t.textContent = vv.phase === "draw" ? secs(vv.endsAt - now()) : "–"; });
  },
  paint(el, v) {
    if (v.phase === "pick" || v.phase === "done") return;
    const cv = $("#dcv", el); if (!cv) return;
    if (draw._local) { draw._setLocal(v.strokes); redraw(cv, draw._local()); } else redraw(cv, v.strokes);
    setHTML($("#dword", el), esc(v.word || v.hint));
    setHTML($("#dstat", el), v.phase === "reveal" ? `<div class="notice ok"><div class="body">A szó: <b>${esc(v.last?.word || v.word)}</b></div></div>` : v.guessed[S.pid] ? `<div class="notice ok"><div class="body">Kitaláltad! +${v.guessed[S.pid]} pont</div></div>` : v.drawer === S.pid ? `<div class="notice"><div class="body">Rajzold le: <b>${esc(v.word)}</b></div></div>` : "");
    setHTML($("#dfeed", el), v.feed.slice().reverse().map((f) => `<div class="q">${avatar(f.pid, true)}<div class="tx">${f.ok ? `<b style="color:var(--ok)">kitalálta!</b>` : esc(f.text) + (f.close ? ` <span class="chipans other">majdnem</span>` : "")}<small>${esc(pname(f.pid))}</small></div></div>`).join("") || `<p class="muted small">Még senki nem tippelt.</p>`);
    setHTML($("#dscore", el), scoreList(v.scores));
  },
};

// ================= Kvíz =================
export const quiz = {
  shellKey: (v) => v.phase === "done" ? "done" : "q" + v.i,
  mount(el, v) {
    if (v.phase === "done") { el.innerHTML = `<div class="card stack"><h2>Vége a kvíznek!</h2>${scoreList(v.scores)}<div class="row"><button data-act="start" data-game="quiz" data-k="n" data-v="10">Új kvíz (10 kérdés)</button></div></div>`; return; }
    el.innerHTML = `<div class="mbar"><span class="pill">${v.i + 1}/${v.n}. kérdés</span><span class="pill">⏱ <b id="qtime"></b></span></div>
      <div class="card"><h2 style="font-size:22px">${esc(v.q)}</h2></div><div class="stack" id="qopts" style="gap:10px"></div><div id="qinfo"></div>
      <div class="card"><div class="eyebrow" style="margin-bottom:6px">Pontok</div><div id="qscore"></div></div>`;
    $("#qopts", el).addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b && !b.disabled) act({ a: "answer", c: +b.dataset.c }); });
    loop("quiz", (vv) => { const t = $("#qtime"); if (t) t.textContent = vv.phase === "q" ? (now() < vv.startAt ? "…" : secs(vv.endsAt - now())) : "–"; });
  },
  paint(el, v) {
    if (v.phase === "done") return;
    const colors = ["var(--accent)", "var(--info)", "var(--ok)", "#c2410c"];
    setHTML($("#qopts", el), v.opts.map((o, i) => {
      const reveal = v.correct != null, right = reveal && i === v.correct, mine = v.mine === i;
      const st = reveal ? (right ? "background:var(--ok);color:#fff;opacity:1;outline:3px solid #fff" : mine ? "background:var(--bad);color:#fff;opacity:.85" : "opacity:.35") : mine ? "outline:3px solid var(--sun);opacity:1" : "";
      return `<button class="big" data-c="${i}" ${v.mine != null || reveal ? "disabled" : ""} style="background:${colors[i]};${st};text-align:left">${esc(o)}${reveal ? ` <span style="float:right">${Object.values(v.answers || {}).filter((a) => a === i).length} fő</span>` : ""}</button>`;
    }).join(""));
    const ans = v.answered.length, tot = Object.values(S.st.players).filter((p) => p.online).length;
    setHTML($("#qinfo", el), v.correct == null ? `<p class="small muted" style="text-align:center">${ans}/${tot} válaszolt${v.mine != null ? " · a tiéd beérkezett" : ""}</p>` : `<div class="notice ${v.mine === v.correct ? "ok" : "err"}"><div class="body">${v.mine === v.correct ? `Helyes! +${v.gain[S.pid]} pont` : v.mine == null ? "Nem válaszoltál." : "Ez most nem jött be."}</div></div>`);
    setHTML($("#qscore", el), scoreList(v.scores));
  },
};

// ================= Négy a sorban =================
export const four = {
  mount(el) {
    el.innerHTML = `<div class="seats" id="fseats"></div><div id="fstat"></div><div id="fboard" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;background:var(--info);padding:8px;border-radius:16px;touch-action:manipulation"></div><div class="row" style="justify-content:center" id="fbtn"></div>`;
    $("#fboard", el).addEventListener("click", (e) => { const c = e.target.closest("[data-col]"); if (c) act({ a: "drop", col: +c.dataset.col }); });
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-fs]"); if (!b) return; const a = b.dataset.fs; act(a === "sit" ? { a, seat: +b.dataset.seat } : { a }); });
  },
  paint(el, v) {
    const col = { 1: "#e2334f", 2: "#ffd23f" };
    const seat = (k) => { const p = v.seats[k]; return `<div class="seat ${!v.winner && v.turn === k && v.seats[1] && v.seats[2] ? "turn" : ""}"><span style="width:26px;height:26px;border-radius:50%;background:${col[k]};flex:0 0 auto"></span>${p ? `${avatar(p, true)}<span style="flex:1;font-weight:600">${esc(pname(p))}${v.wins[p] ? ` <span class="muted small">${v.wins[p]} győzelem</span>` : ""}</span>${p === S.pid ? `<button class="link" data-fs="leave">Feláll</button>` : ""}` : `<button data-fs="sit" data-seat="${k}" style="flex:1">Leülök ide</button>`}</div>`; };
    setHTML($("#fseats", el), seat(1) + seat(2));
    setHTML($("#fstat", el), !v.seats[1] || !v.seats[2] ? `<div class="notice"><div class="body">Kell két játékos: üljetek le a pirosnál és a sárgánál.</div></div>` : v.winner === 3 ? `<div class="notice"><div class="body">Döntetlen.</div></div>` : v.winner ? `<div class="notice ok"><div class="body"><b>${esc(pname(v.seats[v.winner]))}</b> nyert! Négy egy sorban.</div></div>` : `<div class="notice"><div class="body">${v.seats[v.turn] === S.pid ? "<b>Te jössz!</b> Koppints egy oszlopra." : esc(pname(v.seats[v.turn])) + " jön."}</div></div>`);
    const win = new Set(v.line);
    setHTML($("#fboard", el), v.b.map((c, i) => `<button data-col="${i % 7}" aria-label="oszlop ${i % 7 + 1}" style="aspect-ratio:1;border-radius:50%;padding:0;background:${c ? col[c] : "var(--bg)"};border:${win.has(i) ? "4px solid #fff" : i === v.last ? "3px solid rgba(255,255,255,.5)" : "none"}"></button>`).join(""));
    setHTML($("#fbtn", el), v.winner && (v.seats[1] === S.pid || v.seats[2] === S.pid) ? `<button data-fs="again">Visszavágó (csere)</button>` : "");
  },
};

// ================= Torpedó =================
export const battle = {
  mount(el) {
    el.innerHTML = `<div id="bseats" class="seats"></div><div id="bstat2"></div>
      <div class="card"><div class="row between" style="margin-bottom:8px"><span class="eyebrow">Ellenfél vize – ide lősz</span><span class="pill" id="bfoe"></span></div><div id="bfoeb"></div></div>
      <div class="card"><div class="row between" style="margin-bottom:8px"><span class="eyebrow" id="bmine-t">Saját flottád</span><span class="pill" id="bme"></span></div><div id="bmineb"></div><div class="row" id="bsetup" style="justify-content:center;margin-top:10px"></div></div>`;
    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-shot]"); if (c) return act({ a: "shoot", i: +c.dataset.shot });
      const b = e.target.closest("[data-bt]"); if (!b) return; const a = b.dataset.bt; act(a === "sit" ? { a, seat: +b.dataset.seat } : { a });
    });
  },
  paint(el, v) {
    const me = v.me, foe = me === 1 ? 2 : 1;
    const seat = (k) => { const p = v.seats[k]; return `<div class="seat ${!v.winner && v.turn === k && v.ready[1] && v.ready[2] ? "turn" : ""}"><span class="sym">${k === 1 ? "⚓" : "🚢"}</span>${p ? `${avatar(p, true)}<span style="flex:1;font-weight:600">${esc(pname(p))}<br><span class="muted small">${v.ready[k] ? "kész" : "helyezkedik"} · ${v.left[k]} hajó</span></span>` : `<button data-bt="sit" data-seat="${k}" style="flex:1">Leülök</button>`}</div>`; };
    setHTML($("#bseats", el), seat(1) + seat(2));
    const both = v.ready[1] && v.ready[2];
    setHTML($("#bstat2", el), v.winner ? `<div class="notice ok"><div class="body"><b>${esc(pname(v.seats[v.winner]))}</b> elsüllyesztette az összes hajót!</div></div>${me ? `<div class="row" style="justify-content:center"><button data-bt="again">Új csata</button></div>` : ""}`
      : !v.seats[1] || !v.seats[2] ? `<div class="notice"><div class="body">Kell két kapitány.</div></div>` : !both ? `<div class="notice"><div class="body">Rendezzétek el a flottát, aztán nyomjátok meg a Kész gombot.</div></div>`
      : `<div class="notice"><div class="body">${v.seats[v.turn] === S.pid ? "<b>Te lősz!</b> Ha talál, újra jössz." : esc(pname(v.seats[v.turn])) + " lő."}</div></div>`);
    const sym = ["", "", "•", "✕", "✕"], bg = ["var(--surface-2)", "var(--muted)", "var(--surface-2)", "var(--accent)", "var(--bad)"];
    const grid = (cells, shoot) => `<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:3px">${cells.map((c, i) => `<button ${shoot && c < 2 && !v.winner ? `data-shot="${i}"` : "disabled"} style="aspect-ratio:1;padding:0;border-radius:6px;background:${bg[c]};color:#fff;font-weight:800;opacity:1">${sym[c]}</button>`).join("")}</div>`;
    const viewOf = me || 1, other = viewOf === 1 ? 2 : 1;
    setHTML($("#bfoeb", el), grid(v["b" + other], me && both && v.turn === me));
    setHTML($("#bmineb", el), grid(v["b" + viewOf]));
    $("#bmine-t", el).textContent = me ? "Saját flottád" : esc(pname(v.seats[viewOf]) || "1. kapitány") + " flottája";
    $("#bfoe", el).textContent = v.left[other] + " hajó"; $("#bme", el).textContent = v.left[viewOf] + " hajó";
    setHTML($("#bsetup", el), me && !v.ready[me] ? `<button class="ghost" data-bt="shuffle">Újrakever</button><button data-bt="ready">Kész vagyok</button>` : "");
  },
};

// ================= Memória =================
export const memory = {
  mount(el, v) {
    const cols = v.cards.length > 20 ? 6 : v.cards.length > 16 ? 5 : 4;
    el.innerHTML = `<div id="mmstat"></div><div id="mmgrid" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;touch-action:manipulation"></div><div class="card"><div class="eyebrow" style="margin-bottom:6px">Talált párok</div><div id="mmscore"></div></div>`;
    $("#mmgrid", el).addEventListener("click", (e) => { const c = e.target.closest("[data-i]"); if (c && !c.disabled) act({ a: "flip", i: +c.dataset.i }); });
  },
  paint(el, v) {
    setHTML($("#mmstat", el), v.done ? `<div class="notice ok"><div class="body">Minden pár megvan!</div></div><div class="row" style="justify-content:center"><button data-act="start" data-game="memory" data-k="pairs" data-v="10">Új játék</button></div>` : `<div class="notice"><div class="body">${v.cur === S.pid ? "<b>Te jössz!</b> Fordíts fel két lapot." : esc(pname(v.cur)) + " jön."}</div></div>`);
    const mine = v.cur === S.pid && v.open.length < 2;
    setHTML($("#mmgrid", el), v.cards.map((c, i) => { const f = v.found[i]; return `<button data-i="${i}" ${!mine || c ? "disabled" : ""} style="aspect-ratio:3/4;padding:0;border-radius:12px;font-size:clamp(22px,7vw,36px);background:${c ? (f ? "color-mix(in srgb,var(--ok) 25%,var(--surface))" : "var(--surface)") : "repeating-linear-gradient(45deg,var(--accent) 0 8px,color-mix(in srgb,var(--accent) 80%,#000) 8px 16px)"};border:1px solid var(--line);opacity:1">${c || ""}</button>`; }).join(""));
    setHTML($("#mmscore", el), scoreList(v.scores, " pár"));
  },
};

// ================= Kockapóker =================
const PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
export const dice = {
  mount(el) {
    el.innerHTML = `<div id="ystat"></div><div class="row" id="ydice" style="justify-content:center;gap:8px"></div><div class="row" style="justify-content:center" id="ybtn"></div><div class="card tablewrap" id="ysheet"></div>`;
    el.addEventListener("click", (e) => {
      const d = e.target.closest("[data-hold]"); if (d) return act({ a: "hold", i: +d.dataset.hold });
      if (e.target.closest("[data-roll]")) return act({ a: "roll" });
      const c = e.target.closest("[data-cat]"); if (c) return act({ a: "score", cat: c.dataset.cat });
      if (e.target.closest("[data-yjoin]")) act({ a: "join" });
    });
  },
  paint(el, v) {
    const me = v.cur === S.pid;
    setHTML($("#ystat", el), v.done ? `<div class="notice ok"><div class="body">Vége! ${esc(pname(Object.keys(v.totals).sort((a, b) => v.totals[b].total - v.totals[a].total)[0]))} nyert.</div></div>` : `<div class="notice"><div class="body">${me ? `<b>Te dobsz!</b> ${3 - v.rolls} dobásod maradt. Koppints a kockára, amit megtartasz.` : esc(pname(v.cur)) + " dob."}</div></div>`);
    setHTML($("#ydice", el), v.d.map((x, i) => `<button data-hold="${i}" ${!me || !v.rolls ? "disabled" : ""} style="width:58px;height:58px;padding:0;font-size:48px;line-height:1;border-radius:14px;background:${v.hold[i] ? "var(--sun)" : "var(--surface)"};color:${v.hold[i] ? "var(--sun-ink)" : "var(--ink)"};border:1px solid var(--line);opacity:1">${v.rolls ? PIPS[x] : "?"}</button>`).join(""));
    setHTML($("#ybtn", el), me && !v.done ? `<button class="big" data-roll ${v.rolls >= 3 ? "disabled" : ""} style="max-width:320px">Dobás (${v.rolls}/3)</button>` : !v.sheets[S.pid] && !v.done ? `<button data-yjoin>Beszállok</button>` : "");
    const ids = v.order;
    setHTML($("#ysheet", el), `<table><thead><tr><th>Sor</th>${ids.map((p) => `<th class="num">${avatar(p, true)}</th>`).join("")}</tr></thead><tbody>
      ${v.cats.map(([k, l], n) => `${n === 6 ? `<tr><td class="muted">Bónusz (63+)</td>${ids.map((p) => `<td class="num muted">${v.totals[p].bonus || `${v.totals[p].upper}/63`}</td>`).join("")}</tr>` : ""}<tr><td>${l}</td>${ids.map((p) => { const sc = v.sheets[p][k]; const can = me && p === S.pid && sc == null && v.rolls; return `<td class="num">${sc != null ? sc : can ? `<button data-cat="${k}" style="padding:4px 10px;font-size:13px;border-radius:8px">${v.preview[k]}</button>` : ""}</td>`; }).join("")}</tr>`).join("")}
      <tr><td><b>Összesen</b></td>${ids.map((p) => `<td class="num"><b>${v.totals[p].total}</b></td>`).join("")}</tr></tbody></table>`);
  },
};

// ================= Kő-papír-olló =================
const RPS = { ko: "✊ Kő", papir: "✋ Papír", ollo: "✌️ Olló" };
export const rps = {
  mount(el) {
    el.innerHTML = `<div class="mbar"><span class="pill" id="rround"></span></div><div id="rbody" class="stack"></div><div class="card"><div class="eyebrow" style="margin-bottom:6px">Győzelmek összesen</div><div id="rscore"></div></div>`;
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-rp]"); if (b) act({ a: "pick", p: b.dataset.rp }); if (e.target.closest("[data-rnext]")) act({ a: "next" }); });
  },
  paint(el, v) {
    $("#rround", el).textContent = v.round + ". kör";
    const tot = Object.values(S.st.players).filter((p) => p.online).length;
    if (v.phase === "pick") setHTML($("#rbody", el), v.mine ? `<div class="card flat" style="text-align:center"><p>A te választásod: <b>${RPS[v.mine]}</b></p><p class="muted small">${v.picked.length}/${tot} döntött…</p></div>`
      : `<div class="row" style="gap:10px">${Object.entries(RPS).map(([k, l]) => `<button class="big grow" data-rp="${k}" style="font-size:22px;padding:22px 10px">${l}</button>`).join("")}</div><p class="muted small" style="text-align:center">${v.picked.length}/${tot} döntött</p>`);
    else setHTML($("#rbody", el), `<div class="card"><div class="people">${Object.entries(v.last.picks).map(([p, k]) => `<div class="person">${avatar(p)}<span class="nm">${esc(pname(p))}</span><span style="font-size:20px">${RPS[k]}</span><span class="sc">+${v.last.gain[p]}</span></div>`).join("")}</div></div><button class="big" data-rnext>Következő kör</button>`);
    setHTML($("#rscore", el), scoreList(v.scores));
  },
};

// ================= Reakcióidő =================
let goSeen = 0, tapped = false;
export const react = {
  shellKey: (v) => v.round + ":" + (v.phase === "go" || v.phase === "wait" ? "run" : v.phase),
  mount(el, v) {
    tapped = false; goSeen = 0;
    el.innerHTML = `<div class="mbar"><span class="pill">${v.round ? v.round + "/" + v.total + ". kör" : "Reakcióidő"}</span></div>
      <button id="rpad" style="width:100%;height:46vh;border-radius:24px;font-size:28px;font-family:var(--display);font-weight:800;touch-action:manipulation"></button>
      <div class="card"><div class="eyebrow" style="margin-bottom:6px">Eredmények (átlag ms, kevesebb a jobb)</div><div id="rres"></div></div>`;
    $("#rpad", el).addEventListener("pointerdown", () => {
      const vv = S.st.game.v;
      if (vv.phase === "idle" || vv.phase === "result") return act({ a: "go" });
      if (tapped) return; tapped = true;
      act({ a: "tap", ms: vv.phase === "go" && goSeen ? Math.round(performance.now() - goSeen) : 0 });
    });
  },
  paint(el, v) {
    const pad = $("#rpad", el); if (!pad) return;
    if (v.phase === "go" && !goSeen) goSeen = performance.now();
    const mine = v.times[S.pid];
    let txt, bg, fg = "#fff";
    if (v.phase === "idle") { txt = "Koppints az indításhoz"; bg = "var(--info)"; }
    else if (v.phase === "wait") { txt = mine === -1 ? "Korán nyomtad! 😅" : "Várj a zöldre…"; bg = "var(--bad)"; }
    else if (v.phase === "go") { txt = mine != null ? (mine > 0 ? mine + " ms" : "Korán nyomtad!") : "MOST!"; bg = "var(--ok)"; }
    else { txt = (mine > 0 && mine < 3000 ? mine + " ms" : mine === -1 ? "Korán nyomtad" : "Lemaradtál") + (v.round >= v.total ? " · Vége! Koppints az újhoz" : " · Koppints a következőhöz"); bg = "var(--surface-2)"; fg = "var(--ink)"; }
    pad.textContent = txt; pad.style.background = bg; pad.style.color = fg;
    const ids = Object.keys(v.sum).sort((a, b) => v.sum[a] / Math.max(1, v.history.length) - v.sum[b] / Math.max(1, v.history.length));
    setHTML($("#rres", el), ids.length ? `<div class="people">${ids.map((p) => `<div class="person">${avatar(p)}<span class="nm">${esc(pname(p))}<br><span class="muted small">legjobb ${v.best[p] || "–"} ms${v.falses[p] ? ` · ${v.falses[p]}× korán` : ""}</span></span><span class="sc">${Math.round(v.sum[p] / Math.max(1, v.history.length))}</span></div>`).join("")}</div>` : `<p class="muted small">Még nincs eredmény.</p>`);
  },
};
