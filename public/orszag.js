// Ország-város – ugyanaz a felület és szabály, mint a Netlify-os játékban.
import { S, act, esc, avatar, pname, now, toast } from "./app.js";
import { DEFAULT_CATS, startsOk, deadline, evaluate } from "./ovfl-logic.js";
const $ = (s, r = document) => r.querySelector(s);
const setHTML = (el, h) => { if (el && el.innerHTML !== h) el.innerHTML = h; };
const RING = 2 * Math.PI * 52;
let my = {}, myRound = null, saveT = null, flushed = false, tickT = null;

function save() { clearTimeout(saveT); saveT = setTimeout(flush, 500); }
function flush() { clearTimeout(saveT); const g = S.st?.game?.v?.g; if (g && g.status === "playing" && myRound === g.round) act({ a: "ans", round: myRound, v: { ...my } }); }
const sw = (id, on, dis, title, sub) => `<label class="switch" for="${id}"><span>${title}${sub ? `<small>${sub}</small>` : ""}</span><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${dis ? "disabled" : ""}></label>`;
const rulesHTML = () => `<details class="card"><summary>Hogy megy a játék?</summary><ul class="rules">
  <li>A gazda indítja a kört, a gép kisorsol egy betűt. Mindenki minden oszlopba ír egy ezzel a betűvel kezdődő szót.</li>
  <li>Aki mindent kitöltött, megnyomja a <b>STOP</b>-ot. Ekkor 10-től visszaszámolunk, utána senki nem írhat tovább. Ha van időkorlát, annak lejártakor is vége a körnek.</li>
  <li>A kör végén a gép (Claude) kijavítja a válaszokat. A gazda bármelyik döntést átírhatja.</li>
  <li><b>Klasszikus pontozás:</b> ha ugyanazt többen írták, nem ér pontot. Minden helyes szó, amit csak egy játékos írt, 1 pont.</li>
  <li><b>Családi változat:</b> egyedi helyes szó 10, egyező 5, ha az oszlopban csak neked van helyes válaszod, 20 pont.</li>
  <li>Kapcsolható: hosszú és rövid betű egynek számít (u = ú, ö = ő…); kettős betű külön betű (S ≠ Sz).</li></ul></details>`;

function scoreTable(v) {
  const g = v.g, t = v.totals;
  const ids = Object.keys(g.players).sort((a, b) => (t[b] || 0) - (t[a] || 0));
  const rs = Object.values(g.rounds).filter((r) => r.final && r.n > (g.base || 0)).sort((a, b) => a.n - b.n);
  return `<div class="tablewrap"><table><thead><tr><th>Játékos</th>${rs.map((r) => `<th class="num">${esc(r.letter)}</th>`).join("")}<th class="num">Össz.</th></tr></thead>
    <tbody>${ids.map((p) => `<tr><td><span class="row" style="gap:8px;flex-wrap:nowrap">${avatar(p, true)}${esc(pname(p))}</span></td>${rs.map((r) => `<td class="num">${(r.points || {})[p] ?? "–"}</td>`).join("")}<td class="num"><b>${t[p] || 0}</b></td></tr>`).join("")}</tbody></table></div>`;
}

function lobby(el, v) {
  const g = v.g, h = g.ctrl, t = v.totals;
  const rs = Object.values(g.rounds).filter((r) => r.final && r.n > (g.base || 0));
  const ids = Object.keys(g.players).filter((p) => S.st.players[p]?.online || t[p]).sort((a, b) => (t[b] || 0) - (t[a] || 0));
  const ni = document.getElementById("ovnewcat"), nv = ni ? ni.value : "", nf = ni && document.activeElement === ni;
  setHTML(el, `
    <div class="card"><div class="row between" style="margin-bottom:6px"><h3>${rs.length ? `Állás ${rs.length} kör után` : "Játékosok"}</h3></div>
      <div class="people">${ids.map((p) => `<div class="person">${avatar(p)}<span class="nm">${esc(pname(p))}${p === S.pid ? ` <span class="muted small">(te)</span>` : ""}</span>${rs.length ? `<span class="sc">${t[p] || 0}</span>` : ""}</div>`).join("")}</div>
      ${rs.length ? `<details style="margin-top:8px"><summary style="font-size:15px">Körönkénti pontok</summary><div style="margin-top:8px">${scoreTable(v)}</div></details>` : ""}</div>
    <div class="card stack" style="gap:10px">
      <h3>Beállítások ${h ? "" : `<span class="muted small" style="font-family:var(--body);font-weight:500">· a gazda állítja</span>`}</h3>
      <div class="stack" style="gap:8px"><label>Oszlopok</label>
        <div class="chips">${g.cats.map((c, i) => `<span class="chip ${h && g.cats.length > 1 ? "" : "noclose"}">${esc(c)}${h && g.cats.length > 1 ? `<button aria-label="${esc(c)} törlése" data-ov="delcat" data-i="${i}">×</button>` : ""}</span>`).join("")}</div>
        ${h ? `<div class="addrow"><input type="text" id="ovnewcat" class="grow" maxlength="24" placeholder="Új oszlop, pl. Híres ember"><button class="ghost" data-ov="addcat">Hozzáad</button></div><div><button class="link" data-ov="resetcats">Alap oszlopok visszaállítása</button></div>` : ""}</div>
      <div class="selects">
        <div class="stack" style="gap:6px"><label for="ovtime">Időkorlát</label><select id="ovtime" ${h ? "" : "disabled"}>${[[0, "Nincs, csak STOP"], [60, "1 perc"], [90, "1,5 perc"], [120, "2 perc"], [180, "3 perc"]].map(([x, l]) => `<option value="${x}" ${+g.time === x ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="stack" style="gap:6px"><label for="ovmode">Pontozás</label><select id="ovmode" ${h ? "" : "disabled"}><option value="classic" ${g.mode === "classic" ? "selected" : ""}>Klasszikus: egyedi 1, egyező 0</option><option value="family" ${g.mode === "family" ? "selected" : ""}>Családi: 10 / 5 / 20</option></select></div>
      </div>
      <div>${sw("ovmerge", g.merge !== false, !h, "Hosszú és rövid betű egynek számít", "u = ú, a = á, ö = ő…")}${sw("ovstrict", g.strict, !h, "Kettős betű külön betű", "S betűnél a Sz… szó rossz")}</div>
    </div>
    ${rulesHTML()}
    ${h ? `<button class="big" data-ov="start">${rs.length ? "Következő kör" : "Indulhat az első kör"}</button>${rs.length ? `<button class="link" data-ov="end" style="align-self:center">Játék vége, eredményhirdetés</button>` : ""}`
      : `<div class="notice"><div class="body">Várjuk, hogy a gazda elindítsa a kört.</div></div>`}`);
  const n2 = document.getElementById("ovnewcat"); if (n2 && nv && !n2.value) n2.value = nv; if (n2 && nf && document.activeElement !== n2) n2.focus();
}

function playMount(el, v) {
  const g = v.g, r = g.rounds[g.round], cats = r.cats;
  if (myRound !== g.round) { myRound = g.round; flushed = false; my = v.mine ? { ...v.mine } : {}; }
  el.innerHTML = `
    <div class="stage"><div class="letter pop">${esc(g.letter)}</div>
      <div class="ring" id="ovring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="52" fill="none" stroke-width="10"/><circle class="bar" id="ovbar" cx="60" cy="60" r="52" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg><div class="t" id="ovtimer">–</div></div></div>
    <div id="ovbanner"></div>
    <div class="fields">${cats.map((c, i) => `<div class="field"><label for="ovf${i}">${esc(c)}</label><input type="text" id="ovf${i}" data-ci="${i}" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="next" value="${esc(my[i] || "")}"><span class="st" id="ovs${i}"></span><div class="msg" id="ovh${i}" hidden></div></div>`).join("")}</div>
    <div class="card flat"><div class="eyebrow" style="margin-bottom:8px">Ki hol tart</div><div class="progress" id="ovprog"></div></div>
    <button class="big stop" id="ovstop" data-ov="stop">STOP, kész vagyok!</button>
    ${g.ctrl ? `<button class="link" data-ov="forcestop" style="align-self:center">Kör lezárása most</button>` : ""}`;
  el.addEventListener("input", (e) => { const ci = e.target.dataset?.ci; if (ci != null) { my[ci] = e.target.value; save(); playPaint(el, S.st.game.v); } });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset?.ci != null) { const n = $("#ovf" + (+e.target.dataset.ci + 1)); if (n) n.focus(); else e.target.blur(); } });
  clearInterval(tickT); tickT = setInterval(() => { const gv = S.st?.game; if (!gv || gv.type !== "orszag" || gv.v.g.status !== "playing") return clearInterval(tickT); playPaint(el, gv.v); }, 250);
}
function playPaint(el, v) {
  const g = v.g, r = g.rounds[g.round], cats = r.cats, t = now(), dl = deadline(g), pre = t < g.startAt, locked = t >= dl;
  if (locked && !flushed) { flushed = true; flush(); }
  let frac = 1, txt, sub, low = false;
  if (pre) { txt = Math.ceil((g.startAt - t) / 1000); sub = "kezdés"; }
  else if (g.stopAt && !locked) { txt = Math.max(0, Math.ceil((g.stopAt - t) / 1000)); sub = "STOP!"; frac = (g.stopAt - t) / 10000; low = true; }
  else if (g.endsAt) { const s = Math.max(0, Math.ceil((Math.min(dl, g.endsAt) - t) / 1000)); txt = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); sub = "hátra"; frac = (g.endsAt - t) / (g.endsAt - g.startAt); low = s <= 15; }
  else { const s = Math.max(0, Math.floor((Math.min(t, dl) - g.startAt) / 1000)); txt = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); sub = "eltelt"; }
  if (locked) { frac = 0; sub = "vége"; }
  const tm = $("#ovtimer", el); if (!tm) return;
  setHTML(tm, `${txt}<small>${sub}</small>`);
  $("#ovbar", el).setAttribute("stroke-dashoffset", String(RING * (1 - Math.max(0, Math.min(1, frac)))));
  $("#ovring", el).classList.toggle("low", low);
  setHTML($("#ovbanner", el), pre ? `<div class="banner info">Készüljetek! A betű: <b>${esc(g.letter)}</b></div>` : locked ? `<div class="banner">Tollat le! Beszedjük a lapokat…</div>` : g.stopAt ? `<div class="banner">${esc(pname(g.stopBy))} megállította! Még ${Math.max(0, Math.ceil((g.stopAt - t) / 1000))} mp</div>` : "");
  let filled = 0;
  cats.forEach((c, i) => {
    const inp = $("#ovf" + i, el), h = $("#ovh" + i, el), st = $("#ovs" + i, el); if (!inp) return;
    inp.disabled = pre || locked;
    const w = inp.value.trim(); let cls = "", sym = "", msg = "";
    if (w) { filled++; if (startsOk(w, g.letter, r.strict, r.merge !== false)) { cls = "ok"; sym = "✓"; } else { cls = "bad"; sym = "!"; msg = "Nem " + g.letter + " betűvel kezdődik"; } }
    if (st.className !== "st " + cls) { st.className = "st " + cls; st.textContent = sym; }
    if (h.textContent !== msg) { h.textContent = msg; h.hidden = !msg; }
  });
  const sb = $("#ovstop", el); if (sb) sb.disabled = pre || locked || !!g.stopAt || filled < cats.length;
  const fs = $("[data-ov=forcestop]", el); if (fs) fs.disabled = pre || locked || !!g.stopAt;
  const ids = Object.keys(g.players).filter((p) => S.st.players[p]?.online);
  setHTML($("#ovprog", el), ids.map((p) => { const n = p === S.pid ? filled : (v.filled || {})[p] || 0; return `<span class="prog">${avatar(p, true)}${esc(pname(p))}<span class="bar"><i style="width:${Math.round((100 * Math.min(n, cats.length)) / cats.length)}%"></i></span></span>`; }).join(""));
}

function review(el, v) {
  const g = v.g, r = g.rounds[g.round], h = g.ctrl, ev = evaluate(r, v.answers || {});
  const anyWait = Object.values(ev.cells).some((l) => l.some((x) => x.state === "wait"));
  const checking = !r.chkErr && (r.checking || anyWait || !r.chkDone);
  const status = r.chkErr ? `<div class="notice err"><div class="body">${esc(r.chkErr)}<div style="margin-top:8px"><button class="ghost" data-ov="recheck">Javítás újra</button></div></div></div>`
    : checking ? `<div class="notice scan"><div class="body">A gép javítja a válaszokat…</div></div>`
    : `<div class="notice ok"><div class="body">Kijavítva. ${h ? "Ha nem értesz egyet, koppints a pipára vagy az X-re." : "A gazda bármelyik döntést átírhatja."}</div></div>`;
  const ranking = Object.entries(ev.points).sort((a, b) => b[1] - a[1]);
  setHTML(el, `
    <div class="row between" style="flex-wrap:nowrap"><h2>${g.round}. kör javítása</h2><div class="letter sm">${esc(r.letter)}</div></div>
    ${status}
    <div class="card"><div class="eyebrow" style="margin-bottom:6px">A kör pontjai</div><div class="people">${ranking.map(([p, x]) => `<div class="person">${avatar(p)}<span class="nm">${esc(pname(p))}</span><span class="sc">${checking ? "…" : "+" + x}</span></div>`).join("")}</div></div>
    ${(r.cats || []).map((c, ci) => `<div class="card cat"><h3>${esc(c)}</h3>${(ev.cells[ci] || []).map((x) => {
      const lbl = x.state === "ok" ? "✓" : x.state === "bad" ? "✕" : x.state === "wait" ? "…" : "–";
      const cls = x.state === "ok" ? "ok" : x.state === "bad" ? "bad" : "wait";
      const vb = h && x.w && x.state !== "wait" ? `<button class="verdict ${cls}" data-ov="tog" data-k="${esc(x.key)}" data-s="${x.state}" aria-label="Döntés megfordítása">${lbl}</button>` : `<span class="verdict ${cls}">${lbl}</span>`;
      const pts = x.state === "empty" ? 0 : x.pts;
      return `<div class="ans">${avatar(x.p, true)}<div><div class="w ${x.state === "bad" || (x.dup && r.mode !== "family") ? "x" : ""}">${x.w ? esc(x.w) : "<span class='muted' style='font-weight:400'>üres</span>"}${x.dup ? `<span class="tag dup">egyezik</span>` : ""}</div><div class="why">${esc(pname(x.p))}${x.why ? " · " + esc(x.why) : ""}</div></div>${vb}<div class="pts ${pts > 0 ? "on" : ""}">${pts}</div></div>`;
    }).join("") || "<p class='muted small'>Nincs beküldött válasz.</p>"}</div>`).join("")}
    ${h ? `<button class="big" data-ov="record" ${anyWait && !r.chkErr ? "disabled" : ""}>Pontok rögzítése</button>` : `<div class="notice"><div class="body">A gazda rögzíti a pontokat.</div></div>`}`);
}

function final(el, v) {
  const t = v.totals, ids = Object.keys(t).sort((a, b) => t[b] - t[a]);
  const top = [ids[1], ids[0], ids[2]], cls = ["p2", "p1", "p3"], place = [2, 1, 3];
  setHTML(el, `<div class="eyebrow">Eredményhirdetés</div><h1>${ids[0] ? esc(pname(ids[0])) + " nyert!" : "Vége a játéknak"}</h1>
    <div class="podium">${top.map((p, i) => (p ? `<div class="pod ${cls[i]}">${avatar(p)}<span class="nm">${esc(pname(p))}</span><span class="pt">${t[p]} pont</span><div class="blk">${place[i]}</div></div>` : "<div></div>")).join("")}</div>
    <div class="card"><div class="eyebrow" style="margin-bottom:6px">Körönként</div>${scoreTable(v)}</div>
    ${v.g.ctrl ? `<button class="big" data-ov="newparty">Új parti</button>` : ""}`);
}

export const orszag = {
  shellKey: (v) => v.g.status + ":" + v.g.round + ":" + (v.g.ctrl ? 1 : 0),
  mount(el, v) {
    el.innerHTML = `<div class="stack" id="ovbody"></div>`;
    const body = $("#ovbody", el);
    if (v.g.status === "playing") playMount(body, v);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ov]"); if (!b) return; const a = b.dataset.ov, g = S.st.game.v.g;
      if (a === "start" || a === "end" || a === "newparty" || a === "record" || a === "recheck") act({ a });
      else if (a === "stop") { flush(); act({ a: "stop" }); }
      else if (a === "forcestop") { flush(); act({ a: "stop", force: true }); }
      else if (a === "tog") act({ a: "override", key: b.dataset.k, val: b.dataset.s !== "ok" });
      else if (a === "delcat") { const c = g.cats.slice(); c.splice(+b.dataset.i, 1); act({ a: "settings", cats: c }); }
      else if (a === "resetcats") act({ a: "settings", cats: DEFAULT_CATS });
      else if (a === "addcat") { const i = $("#ovnewcat"); const x = (i.value || "").trim(); if (x && !g.cats.includes(x)) { i.value = ""; act({ a: "settings", cats: g.cats.concat([x]) }); } }
    });
    el.addEventListener("change", (e) => {
      const id = e.target.id;
      if (id === "ovtime") act({ a: "settings", time: +e.target.value });
      if (id === "ovmode") act({ a: "settings", mode: e.target.value });
      if (id === "ovstrict") act({ a: "settings", strict: e.target.checked });
      if (id === "ovmerge") act({ a: "settings", merge: e.target.checked });
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "ovnewcat") $("[data-ov=addcat]", el)?.click(); });
  },
  paint(el, v) {
    const body = $("#ovbody", el); const st = v.g.status;
    if (st === "lobby") lobby(body, v); else if (st === "playing") playPaint(body, v); else if (st === "review") review(body, v); else final(body, v);
  },
};
