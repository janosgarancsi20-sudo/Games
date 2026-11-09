import { S, act, esc, avatar, pname, toast, now } from "./app.js";
const $ = (s, r = document) => r.querySelector(s);
const setHTML = (el, h) => { if (el && el.innerHTML !== h) el.innerHTML = h; };
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const scoreList = (scores, unit = "") => {
  const ids = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  return ids.length ? `<div class="people">${ids.map((p) => `<div class="person">${avatar(p)}<span class="nm">${esc(pname(p))}</span><span class="sc">${scores[p]}${unit}</span></div>`).join("")}</div>` : `<p class="muted small">Még senki nem szerzett pontot.</p>`;
};

// ================= Aknakereső =================
let mineMode = "open", mineTimer = null;
export const mines = {
  mount(el, v) {
    el.innerHTML = `
      <div class="mbar"><span class="pill">💣 <b id="mleft"></b></span><span class="pill">⏱ <b id="mtime"></b></span>
        <div class="seg" role="group" aria-label="Mód"><button data-m="open" class="${mineMode === "open" ? "on" : ""}">Nyitás</button><button data-m="flag" class="${mineMode === "flag" ? "on" : ""}">🚩 Zászló</button></div></div>
      <div id="mstat"></div>
      <div class="mgrid" id="mgrid" style="grid-template-columns:repeat(${v.w},1fr);max-width:${v.w * 44}px"></div>
      <p class="small muted" style="text-align:center">Tipp: hosszan nyomva is zászlót tehetsz.</p>
      <div class="card"><div class="eyebrow" style="margin-bottom:6px">Pontok (felnyitott mezők)</div><div id="mscore"></div></div>`;
    el.querySelector(".seg").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; mineMode = b.dataset.m; el.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b)); });
    const grid = $("#mgrid", el);
    let pressT = null, longDone = false;
    grid.addEventListener("pointerdown", (e) => { const c = e.target.closest("[data-i]"); if (!c) return; longDone = false; pressT = setTimeout(() => { longDone = true; navigator.vibrate?.(30); act({ a: "flag", i: +c.dataset.i }); }, 450); });
    const cancel = () => clearTimeout(pressT);
    grid.addEventListener("pointerup", cancel); grid.addEventListener("pointerleave", cancel); grid.addEventListener("pointercancel", cancel);
    grid.addEventListener("contextmenu", (e) => { e.preventDefault(); const c = e.target.closest("[data-i]"); if (c && !longDone) act({ a: "flag", i: +c.dataset.i }); longDone = true; });
    grid.addEventListener("click", (e) => { const c = e.target.closest("[data-i]"); if (!c || longDone) return; act({ a: mineMode === "flag" ? "flag" : "open", i: +c.dataset.i }); });
    clearInterval(mineTimer); mineTimer = setInterval(() => { const g = S.st?.game; if (!g || g.type !== "mines") return clearInterval(mineTimer); $("#mtime") && ($("#mtime").textContent = fmt((g.v.endedAt || now()) - g.v.startedAt)); }, 500);
  },
  paint(el, v) {
    $("#mleft", el).textContent = v.left;
    $("#mtime", el).textContent = fmt((v.endedAt || now()) - v.startedAt);
    const st = v.status === "won" ? `<div class="notice ok"><div class="body"><b>Megvan!</b> Minden aknát elkerültetek, ${fmt(v.endedAt - v.startedAt)} alatt.</div></div>`
      : v.status === "lost" ? `<div class="banner">Bumm! ${esc(pname(v.loser))} aknára lépett (−10 pont).</div>` : "";
    setHTML($("#mstat", el), st + (v.status !== "playing" ? `<div class="row" style="justify-content:center;margin-top:8px"><button data-act="start" data-game="mines" data-k="size" data-v="${v.size}">Új tábla</button></div>` : ""));
    const html = v.cells.map((c, i) => {
      const f = v.flags[i];
      if (c === -1) return `<button class="mc ${f ? "f" : ""}" data-i="${i}" aria-label="mező">${f ? "🚩" : ""}</button>`;
      if (c === 9) return `<button class="mc m" data-i="${i}" disabled>${f ? "🚩" : "💣"}</button>`;
      if (c === 10) return `<button class="mc b" data-i="${i}" disabled>💥</button>`;
      return `<button class="mc o n${c}" data-i="${i}" disabled>${c || ""}</button>`;
    }).join("");
    setHTML($("#mgrid", el), html);
    setHTML($("#mscore", el), scoreList(v.scores));
  },
};

// ================= Amőba =================
export const amoba = {
  mount(el) {
    el.innerHTML = `<div class="seats" id="aseats"></div><div id="astat"></div><div class="agrid" id="agrid"></div><div class="row" style="justify-content:center" id="abtn"></div>`;
    $("#agrid", el).addEventListener("click", (e) => { const c = e.target.closest("[data-i]"); if (c) act({ a: "put", i: +c.dataset.i }); });
  },
  paint(el, v) {
    const sym = { 1: "✕", 2: "○" };
    const seat = (k) => { const p = v.seats[k]; return `<div class="seat ${!v.winner && v.turn === k && v.seats[1] && v.seats[2] ? "turn" : ""}"><span class="sym" style="color:${k === 1 ? "var(--accent)" : "var(--info)"}">${sym[k]}</span>${p ? `${avatar(p, true)}<span class="nm" style="flex:1;font-weight:600">${esc(pname(p))}${v.wins[p] ? ` <span class="muted small">${v.wins[p]} győzelem</span>` : ""}</span>${p === S.pid ? `<button class="link" data-amoba="leave">Feláll</button>` : ""}` : `<button data-amoba="sit" data-seat="${k}" style="flex:1">Leülök</button><button class="ghost" data-act="botsit" data-seat="${k}">🤖 Gép</button>`}</div>`; };
    setHTML($("#aseats", el), seat(1) + seat(2));
    let st;
    if (!v.seats[1] || !v.seats[2]) st = `<div class="notice"><div class="body">Kell két játékos: üljetek le az X-hez és az O-hoz.</div></div>`;
    else if (v.winner === 3) st = `<div class="notice"><div class="body">Döntetlen, betelt a tábla.</div></div>`;
    else if (v.winner) st = `<div class="notice ok"><div class="body"><b>${esc(pname(v.seats[v.winner]))}</b> nyert! Öt egy sorban.</div></div>`;
    else st = `<div class="notice"><div class="body">${v.seats[v.turn] === S.pid ? "<b>Te jössz!</b>" : `${esc(pname(v.seats[v.turn]))} jön.`}</div></div>`;
    setHTML($("#astat", el), st);
    const win = new Set(v.line);
    setHTML($("#agrid", el), v.b.map((c, i) => `<button class="ac ${c === 1 ? "x" : c === 2 ? "o" : ""} ${i === v.last ? "last" : ""} ${win.has(i) ? "win" : ""}" data-i="${i}" aria-label="mező ${i}">${c ? sym[c] : ""}</button>`).join(""));
    const me = v.seats[1] === S.pid || v.seats[2] === S.pid;
    setHTML($("#abtn", el), v.winner && me ? `<button data-amoba="again">Visszavágó (csere)</button>` : "");
  },
};
document.addEventListener("click", (e) => { const b = e.target.closest("[data-amoba]"); if (!b) return; const a = b.dataset.amoba; act(a === "sit" ? { a, seat: +b.dataset.seat } : { a }); });

// ================= Akasztófa =================
const HU = "AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ".split("");
function gallows(w) {
  const parts = [
    '<line x1="10" y1="140" x2="90" y2="140"/>', '<line x1="30" y1="140" x2="30" y2="10"/>', '<line x1="30" y1="10" x2="100" y2="10"/>', '<line x1="100" y1="10" x2="100" y2="28"/>',
    '<circle cx="100" cy="42" r="14"/>', '<line x1="100" y1="56" x2="100" y2="96"/>', '<line x1="100" y1="66" x2="82" y2="84"/>', '<line x1="100" y1="66" x2="118" y2="84"/>',
    '<line x1="100" y1="96" x2="86" y2="122"/>', '<line x1="100" y1="96" x2="114" y2="122"/>'];
  return `<svg class="gallows" viewBox="0 0 150 150" aria-label="${w} hiba">${parts.slice(0, w).join("")}</svg>`;
}
export const hangman = {
  shellKey: (v) => v.phase + (v.setter === S.pid ? ":s" : ""),
  mount(el, v) {
    const setter = v.setter === S.pid;
    if (v.phase === "setup") {
      el.innerHTML = setter
        ? `<div class="card stack"><h3>Add fel a szót</h3><p class="small muted">A többiek nem látják. Lehet több szó is, ékezettel.</p>
           <form class="stack" data-hform="word"><input type="text" id="hword" maxlength="40" placeholder="pl. Balaton" autocomplete="off"><input type="text" id="hhint" maxlength="40" placeholder="Segítség (nem kötelező), pl. tó" autocomplete="off"><button class="big">Indulhat</button></form></div>`
        : `<div class="card flat scan"><p><b>${esc(pname(v.setter))}</b> most találja ki a szót…</p></div>`;
    } else {
      el.innerHTML = `<div id="hinfo"></div><div id="hg"></div><div class="word" id="hword2"></div><div id="hstat"></div>
        ${!setter && v.phase === "play" ? `<div class="keys" id="hkeys"></div><form class="addrow" data-hform="solve"><input type="text" id="hsolve" class="grow" maxlength="40" placeholder="Tudod? Írd be az egészet (rossz tipp: 2 hiba)" autocomplete="off"><button class="ghost">Tipp</button></form>` : ""}
        <div class="card"><div class="eyebrow" style="margin-bottom:6px">Talált betűk</div><div id="hscore"></div></div>`;
      const k = $("#hkeys", el); if (k) k.addEventListener("click", (e) => { const b = e.target.closest("[data-l]"); if (b && !b.disabled) act({ a: "letter", l: b.dataset.l }); });
    }
    el.addEventListener("submit", (e) => {
      const f = e.target.closest("[data-hform]"); if (!f) return; e.preventDefault();
      if (f.dataset.hform === "word") act({ a: "word", word: $("#hword").value, hint: $("#hhint").value });
      else { const i = $("#hsolve"); if (i.value.trim()) { act({ a: "solve", text: i.value }); i.value = ""; } }
    });
  },
  paint(el, v) {
    if (v.phase === "setup") return;
    setHTML($("#hinfo", el), `<div class="row between"><span class="pill">Feladó: <b style="letter-spacing:0">${esc(pname(v.setter))}</b></span>${v.hint ? `<span class="pill">Segítség: <b style="letter-spacing:0">${esc(v.hint)}</b></span>` : ""}<span class="pill">Hiba <b>${v.wrong}/${v.max}</b></span></div>`);
    setHTML($("#hg", el), gallows(v.wrong));
    setHTML($("#hword2", el), v.masked.map((c) => (c === " " ? `<span class="sp"></span>` : `<span>${c === "_" ? "" : esc(c)}</span>`)).join(""));
    let st = "";
    if (v.phase === "done") st = v.winner === "guessers" ? `<div class="notice ok"><div class="body"><b>Kitaláltátok!</b>${v.solver ? ` ${esc(pname(v.solver))} mondta ki a megoldást.` : ""}</div></div>` : `<div class="banner">Felakasztva! ${esc(pname(v.setter))} nyert.</div>`;
    else if (v.setter === S.pid) st = `<div class="notice"><div class="body">Te adtad fel, most csak nézed, hogyan tippelnek.</div></div>`;
    if (v.phase === "done") st += `<div class="row" style="justify-content:center;margin-top:8px"><button data-act="start" data-game="hangman">Új kör, én adom fel</button></div>`;
    setHTML($("#hstat", el), st);
    const keys = $("#hkeys", el);
    if (keys) setHTML(keys, HU.map((L) => { const t = v.tried.includes(L); const hit = t && v.masked.includes(L); return `<button data-l="${L}" class="${t ? (hit ? "hit" : "miss") : ""}" ${t || v.phase !== "play" ? "disabled" : ""}>${L}</button>`; }).join(""));
    setHTML($("#hscore", el), scoreList(v.by, " betű"));
  },
};

// ================= Barkóba =================
const ANS = [["igen", "Igen"], ["nem", "Nem"], ["részben", "Részben"], ["talán", "Talán"], ["nem tudom", "Nem tudom"]];
export const barkoba = {
  shellKey: (v) => v.phase + (v.thinker === S.pid ? ":t" : ""),
  mount(el, v) {
    const me = v.thinker === S.pid;
    if (v.phase === "setup") {
      el.innerHTML = me
        ? `<div class="card stack"><h3>Mire gondolsz?</h3><p class="small muted">Csak te látod. A többiek igen/nem kérdésekkel próbálják kitalálni.</p>
           <form class="stack" data-bform="secret"><input type="text" id="bsecret" maxlength="60" placeholder="pl. Eiffel-torony" autocomplete="off"><input type="text" id="bhint" maxlength="40" placeholder="Kategória (nem kötelező), pl. épület" autocomplete="off"><button class="big">Kezdődhet</button></form></div>`
        : `<div class="card flat scan"><p><b>${esc(pname(v.thinker))}</b> most gondol valamire…</p></div>`;
    } else {
      el.innerHTML = `<div id="binfo"></div><div id="bstat"></div>
        ${!me && v.phase === "play" ? `<form class="card stack" data-bform="ask" style="gap:8px"><input type="text" id="bq" maxlength="120" placeholder="Kérdezz! pl. Élőlény?" autocomplete="off" enterkeyhint="send">
          <div class="row"><button class="grow" data-kind="ask">Kérdezek</button><button class="ghost grow" data-kind="guess">Tippelek: ez az!</button></div></form>` : ""}
        <div class="qlist" id="bq-list"></div>`;
    }
    el.addEventListener("submit", (e) => {
      const f = e.target.closest("[data-bform]"); if (!f) return; e.preventDefault();
      if (f.dataset.bform === "secret") act({ a: "secret", secret: $("#bsecret").value, hint: $("#bhint").value });
      else { const kind = e.submitter?.dataset.kind || "ask"; const i = $("#bq"); if (i.value.trim()) { act({ a: kind, text: i.value }); i.value = ""; } }
    });
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-ans]"); if (b) act({ a: "answer", id: +b.dataset.id, ans: b.dataset.ans }); if (e.target.closest("[data-bgive]")) act({ a: "giveup" }); });
  },
  paint(el, v) {
    if (v.phase === "setup") return;
    const me = v.thinker === S.pid;
    setHTML($("#binfo", el), `<div class="row between"><span class="pill">Gondoló: <b style="letter-spacing:0">${esc(pname(v.thinker))}</b></span>${v.hint ? `<span class="pill">Kategória: <b style="letter-spacing:0">${esc(v.hint)}</b></span>` : ""}<span class="pill">Kérdés <b>${v.asks}/${v.max}</b></span></div>`);
    let st = "";
    if (v.phase === "done") st = `<div class="card stack" style="gap:6px;text-align:center"><div class="eyebrow">A megfejtés</div><div class="secret">${esc(v.secret)}</div><p>${v.winner === v.thinker ? `Nem találták ki, <b>${esc(pname(v.thinker))}</b> nyert.` : `<b>${esc(pname(v.winner))}</b> kitalálta!`}</p><div><button data-act="start" data-game="barkoba">Új kör, én gondolok</button></div></div>`;
    else if (me) st = `<div class="notice"><div class="body">A titkod: <b>${esc(v.secret)}</b>. Válaszolj a kérdésekre lent.</div></div><div style="text-align:center"><button class="link" data-bgive>Feladják? Felfedem a megoldást</button></div>`;
    else if (v.asks >= v.max) st = `<div class="notice err"><div class="body">Elfogyott a ${v.max} kérdés, már csak tippelni lehet.</div></div>`;
    setHTML($("#bstat", el), st);
    const qs = v.qs.slice().reverse();
    setHTML($("#bq-list", el), qs.map((q) => {
      const n = q.kind === "ask" ? v.qs.filter((x) => x.kind === "ask" && x.id <= q.id).length + "." : "★";
      const chip = q.ans ? `<span class="chipans ${q.ans === "igen" || q.ans === "talált" ? q.ans : q.ans === "nem" ? "nem" : "other"}">${esc(q.ans)}</span>` : `<span class="chipans wait">vár</span>`;
      const btns = me && !q.ans && v.phase === "play" ? `<div class="ansb">${q.kind === "guess" ? `<button data-ans="talált" data-id="${q.id}">Eltalálta!</button><button class="ghost" data-ans="nem" data-id="${q.id}">Nem ez</button>` : ANS.map(([a, l]) => `<button class="${a === "igen" ? "" : "ghost"}" data-ans="${a}" data-id="${q.id}">${l}</button>`).join("")}</div>` : "";
      return `<div class="q"><span class="num">${n}</span><div class="tx">${q.kind === "guess" ? "<b>Tipp:</b> " : ""}${esc(q.text)}<small>${esc(pname(q.pid))}</small>${btns}</div>${chip}</div>`;
    }).join("") || `<p class="muted small" style="text-align:center">Még nincs kérdés.</p>`);
  },
};
