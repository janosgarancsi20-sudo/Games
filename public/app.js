import { mines, amoba, hangman, barkoba } from "./games.js";
import { solitaire } from "./solitaire.js";

const VIEWS = { mines, amoba, hangman, barkoba, solitaire };
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

export const S = { pid: ls.get("hj.pid"), name: ls.get("hj.name") || "", code: null, st: null, ws: null, wantCode: null, create: false,
  shellKey: "", chatOpen: false, seenChat: 0, offset: 0, retry: 0 };
if (!S.pid || !/^[A-Za-z0-9]{6,40}$/.test(S.pid)) { S.pid = "p" + crypto.getRandomValues(new Uint32Array(3)).join("").slice(0, 18); ls.set("hj.pid", S.pid); }

// ---------- kapcsolat ----------
function connect() {
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  S.ws = ws;
  ws.onopen = () => { S.retry = 0; S.connected = true; hello(); paintConn(); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === "state") { S.offset = m.now - Date.now(); S.st = m; S.code = m.code; S.create = false; setHash(m.code); render(); }
    else if (m.t === "err") { toast(m.msg); if (m.gone) { S.wantCode = null; S.code = null; setHash(""); render(true); } }
  };
  ws.onclose = () => { S.connected = false; paintConn(); setTimeout(connect, Math.min(8000, 500 * 2 ** S.retry++)); };
}
function hello() {
  if (!S.ws || S.ws.readyState !== 1 || !S.name) return;
  if (S.create) S.ws.send(JSON.stringify({ t: "hello", pid: S.pid, name: S.name, create: true }));
  else if (S.wantCode) S.ws.send(JSON.stringify({ t: "hello", pid: S.pid, name: S.name, code: S.wantCode }));
}
export function send(o) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); else toast("Nincs kapcsolat, újracsatlakozom…"); }
export const act = (o) => send({ t: "act", ...o });
export const now = () => Date.now() + S.offset;
function setHash(c) { const h = c ? "#" + c : ""; if (location.hash !== h) history.replaceState(null, "", location.pathname + h); }

let toastT;
export function toast(msg) { let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3200); }
function paintConn() { const el = $("#conn"); if (el) el.innerHTML = S.connected ? "" : `<div class="notice err"><div class="body">Megszakadt a kapcsolat, újracsatlakozom…</div></div>`; }

// ---------- segédek ----------
const AV = ["#f04e2c", "#3d5af1", "#119c68", "#c2410c", "#8b5cf6", "#0e9fb3", "#d63384", "#b8860b"];
export function pname(id) { return (S.st && S.st.players[id] && S.st.players[id].name) || "Valaki"; }
export function avatar(id, sm) {
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const n = pname(id).trim();
  return `<span class="av ${sm ? "sm" : ""}" style="background:${AV[h % AV.length]}" aria-hidden="true">${esc((n[0] || "?").toUpperCase())}</span>`;
}
const isHost = () => S.st && S.st.host === S.pid;

const CATALOG = [
  { id: "mines", ic: "✹", bg: "var(--bad)", title: "Aknakereső", desc: "Közös tábla. Mindenki nyithat, a pont a felnyitott mezőkért jár. Aki aknára lép, mindenkinek vége.",
    opts: [["kicsi", "Kicsi"], ["kozepes", "Közepes"], ["nagy", "Nagy"]], key: "size" },
  { id: "solitaire", ic: "♠", bg: "var(--info)", title: "Passziánsz-verseny", desc: "Mindenki ugyanazt a leosztást kapja. Az nyer, aki elsőként rakja fel mind az 52 lapot.",
    opts: [[1, "1 lapos húzás"], [3, "3 lapos"]], key: "draw" },
  { id: "barkoba", ic: "?", bg: "var(--sun)", fg: "var(--sun-ink)", title: "Barkóba", desc: "Te gondolsz valamire, a többiek igen/nem kérdésekkel találják ki. Legfeljebb 20 kérdés." },
  { id: "amoba", ic: "✕", bg: "var(--accent)", title: "Amőba", desc: "Ketten játszotok egy 15×15-ös táblán, öt egy sorban nyer. A többiek nézik." },
  { id: "hangman", ic: "A", bg: "var(--ok)", title: "Akasztófa", desc: "Te adod fel a szót, a többiek együtt tippelnek betűket. 10 hiba után vége." },
];

// ---------- megjelenítés ----------
export function render(force) {
  if (!S.code || !S.st) return renderHome(force);
  const g = S.st.game;
  const key = g ? "g:" + g.type + ":" + g.startedAt + ":" + (VIEWS[g.type].shellKey ? VIEWS[g.type].shellKey(g.v) : "") : "room";
  if (key !== S.shellKey || force) {
    S.shellKey = key;
    const keep = keepInputs();
    app.innerHTML = g ? gameShell(g) : roomShell();
    if (g) VIEWS[g.type].mount($("#game"), g.v);
    restoreInputs(keep);
    app.firstElementChild?.classList.add("fade");
  }
  if (g) VIEWS[g.type].paint($("#game"), g.v); else paintRoom();
  paintChat(); paintConn();
}
function keepInputs() { const a = document.activeElement; const vals = {}; app.querySelectorAll("input[id],textarea[id]").forEach((i) => (vals[i.id] = i.value)); return { vals, focus: a && a.id, sel: a && a.selectionStart }; }
function restoreInputs(k) { Object.entries(k.vals).forEach(([id, v]) => { const el = document.getElementById(id); if (el && !el.value) el.value = v; }); if (k.focus) { const el = document.getElementById(k.focus); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(k.sel, k.sel); } catch {} } } }

function topbar(right) { return `<div class="top"><div class="brand"><span class="mark">J</span>Haveri játékok</div>${right || ""}</div>`; }

function renderHome() {
  S.shellKey = "home";
  const pre = S.wantCode;
  app.innerHTML = `<div class="stack fade">
    <div class="hero">
      <div class="tiles" aria-hidden="true"><span class="tile">✹</span><span class="tile">♠</span><span class="tile">?</span><span class="tile">✕</span></div>
      <h1>Haveri játékok</h1>
      <p>Aknakereső, passziánsz, barkóba, amőba és akasztófa. Egy szoba, egy link, és mindenki a saját telefonjáról játszik.</p>
    </div>
    <div id="conn"></div>
    <div class="card stack">
      <div class="stack" style="gap:6px"><label for="name">A neved</label><input type="text" id="name" maxlength="20" placeholder="pl. Peti" value="${esc(S.name)}" autocomplete="nickname" enterkeyhint="go"></div>
      ${pre ? `<button class="big" data-act="join">Belépés a ${esc(pre)} szobába</button><div class="or">vagy</div><button class="ghost" data-act="create">Saját szoba nyitása</button>`
      : `<button class="big" data-act="create">Új szoba nyitása</button>
      <div class="or">vagy van kódod?</div>
      <div class="addrow"><input type="text" id="joincode" class="grow codein" maxlength="4" placeholder="ABCD" autocomplete="off" enterkeyhint="go"><button class="ghost" data-act="join">Belépés</button></div>`}
    </div>
    <p class="small muted" style="text-align:center">Ha egy ideje senki nem használta, az első betöltés kb. egy percig tarthat, mert a szerver ilyenkor ébred fel.</p>
  </div>`;
  paintConn();
}

function roomShell() {
  const link = location.origin + location.pathname + "#" + S.code;
  return `<div class="stack">
    ${topbar(`<button class="link" data-act="leave">Kilépés</button>`)}
    <div id="conn"></div>
    <div class="card stack" style="gap:10px">
      <div class="codebox"><div><div class="eyebrow">Szobakód</div><div class="code">${esc(S.code)}</div></div><button class="ghost" data-act="copy" id="copybtn">Link másolása</button></div>
      <div class="share"><input type="text" id="sharelink" readonly value="${esc(link)}" aria-label="Meghívó link"></div>
    </div>
    <div class="card"><div class="row between" style="margin-bottom:4px"><h3>Bent vannak</h3><span class="pill" id="pcount"></span></div><div class="people" id="people"></div></div>
    <div><h2 style="margin:6px 0 12px">Mit játsszunk?</h2>
    <div class="picker">${CATALOG.map((c) => `<div class="gcard"><span class="ic" style="background:${c.bg};color:${c.fg || "#fff"}">${c.ic}</span><h3>${c.title}</h3><p>${c.desc}</p>
      <div class="opts">${c.opts ? c.opts.map(([v, l]) => `<button data-act="start" data-game="${c.id}" data-k="${c.key}" data-v="${v}">${l}</button>`).join("") : `<button data-act="start" data-game="${c.id}">Indítás</button>`}</div></div>`).join("")}</div></div>
    <div class="card inline-chat"><h3 style="margin-bottom:8px">Csevegő</h3><div class="msgs" id="msgs"></div>
      <form class="chatin" data-form="chat"><input type="text" id="chatin" maxlength="300" placeholder="Írj valamit…" autocomplete="off" enterkeyhint="send"><button>Küld</button></form></div>
  </div>`;
}
function paintRoom() {
  const st = S.st, ids = Object.keys(st.players).sort((a, b) => st.players[a].joined - st.players[b].joined);
  const on = ids.filter((p) => st.players[p].online).length;
  $("#pcount").textContent = on + " online";
  const html = ids.map((p) => `<div class="person">${avatar(p)}<span class="nm">${esc(pname(p))}${p === S.pid ? ` <span class="muted small">(te)</span>` : ""}${p === st.host ? `<span class="tag">gazda</span>` : ""}</span><span class="dot ${st.players[p].online ? "on" : ""}" title="${st.players[p].online ? "online" : "nincs itt"}"></span></div>`).join("");
  const el = $("#people"); if (el.innerHTML !== html) el.innerHTML = html;
}

function gameShell(g) {
  const canEnd = isHost() || g.by === S.pid;
  return `<div class="stack">
    <div class="top"><div class="brand"><span class="mark">J</span>${esc(g.name)}</div><span class="pill">Szoba <b>${esc(S.code)}</b></span></div>
    <div id="conn"></div>
    <div id="game" class="stack"></div>
    ${canEnd ? `<button class="link" data-act="end" style="align-self:center">Játék bezárása, vissza a szobába</button>` : `<p class="small muted" style="text-align:center">A játékot ${esc(pname(g.by))} vagy a gazda zárhatja be.</p>`}
    <button class="chatfab" data-act="chat" aria-label="Csevegő">💬<span class="badge" id="badge" hidden></span></button>
    <div class="sheet" id="sheet" ${S.chatOpen ? "" : "hidden"}><div class="grab"></div><div class="row between"><h3>Csevegő</h3><button class="link" data-act="chat">Bezár</button></div>
      <div class="msgs" id="msgs"></div><form class="chatin" data-form="chat"><input type="text" id="chatin" maxlength="300" placeholder="Írj valamit…" autocomplete="off" enterkeyhint="send"><button>Küld</button></form></div>
  </div>`;
}
function paintChat() {
  const box = $("#msgs"); if (!box) return;
  const html = S.st.chat.map((c) => c.sys ? `<div class="msg sys">${esc(c.text)}</div>`
    : `<div class="msg ${c.pid === S.pid ? "me" : ""}">${avatar(c.pid, true)}<div class="bub"><b>${esc(pname(c.pid))}</b>${esc(c.text)}</div></div>`).join("");
  if (box.innerHTML !== html) { const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60; box.innerHTML = html; if (atEnd || !S.didScroll) box.scrollTop = box.scrollHeight; S.didScroll = true; }
  const last = S.st.chat.filter((c) => !c.sys).slice(-1)[0];
  const lastId = last ? last.id : 0;
  const visible = !S.st.game || S.chatOpen;
  if (visible) S.seenChat = lastId;
  const badge = $("#badge");
  if (badge) { const n = S.st.chat.filter((c) => !c.sys && c.id > S.seenChat && c.pid !== S.pid).length; badge.hidden = !n; badge.textContent = n; }
}

// ---------- események ----------
app.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "create" || a === "join") {
    const n = ($("#name")?.value || "").trim(); if (!n) return toast("Írd be a neved.");
    S.name = n; ls.set("hj.name", n);
    if (a === "create") { S.create = true; S.wantCode = null; }
    else { const c = ($("#joincode")?.value || S.wantCode || "").toUpperCase().trim(); if (!/^[A-Z]{4}$/.test(c)) return toast("A szobakód 4 betű."); S.wantCode = c; S.create = false; }
    hello();
  } else if (a === "leave") { S.code = null; S.st = null; S.wantCode = null; setHash(""); S.ws?.close(); render(true); }
  else if (a === "copy") { const el = $("#sharelink"); try { await navigator.clipboard.writeText(el.value); b.textContent = "Kimásolva ✓"; } catch { el.select(); b.textContent = "Jelöld ki és másold"; } setTimeout(() => (b.textContent = "Link másolása"), 2500); }
  else if (a === "start") { const opts = {}; if (b.dataset.k) opts[b.dataset.k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; send({ t: "start", game: b.dataset.game, opts }); }
  else if (a === "end") send({ t: "end" });
  else if (a === "chat") { S.chatOpen = !S.chatOpen; $("#sheet").hidden = !S.chatOpen; paintChat(); if (S.chatOpen) { const m = $("#msgs"); m.scrollTop = m.scrollHeight; $("#chatin")?.focus(); } }
});
app.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form]"); if (!f) return; e.preventDefault();
  if (f.dataset.form === "chat") { const i = $("#chatin"); const v = i.value.trim(); if (v) { send({ t: "chat", text: v }); i.value = ""; } }
});
app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "name" || e.target.id === "joincode") { e.preventDefault(); (S.wantCode || e.target.id === "joincode" ? $("[data-act=join]") : $("[data-act=create]"))?.click(); }
});

// ---------- indulás ----------
const m = location.hash.match(/^#([A-Za-z]{4})$/);
if (m) S.wantCode = m[1].toUpperCase();
render(true);
connect();
