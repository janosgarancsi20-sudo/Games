// Haveri játékok – szobák, csevegő és játékok egy Node szerveren, WebSockettel.
// Indítás: npm install && npm start  (PORT környezeti változó, alap 8080)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { GAMES } from "./games/index.mjs";
import { botStep, BOT_NAMES, BOT_GAMES } from "./games/bots.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, "public");
const PORT = +process.env.PORT || 8080;

const rooms = new Map(); // code -> room
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
const pidOk = (p) => typeof p === "string" && /^[A-Za-z0-9]{6,40}$/.test(p);

function newCode() {
  const abc = "ABCDEFGHJKLMNPRSTUVZ";
  for (;;) { let c = ""; for (let i = 0; i < 4; i++) c += abc[crypto.randomInt(abc.length)]; if (!rooms.has(c)) return c; }
}
function makeRoom(pid) {
  const code = newCode();
  const room = { code, host: pid, players: {}, chat: [], game: null, socks: new Map(), touched: Date.now(), seq: 0 };
  room.push = () => broadcast(room); // aszinkron játékesemények (pl. javítás) után
  rooms.set(code, room);
  return room;
}
const LEVEL_HU = { easy: "könnyű", medium: "közepes", hard: "nehéz" };
function addBot(room, level) {
  const bots = Object.values(room.players).filter((p) => p.bot);
  if (bots.length >= 8) throw new Error("Legfeljebb 8 gép lehet egy szobában.");
  const used = new Set(Object.values(room.players).map((p) => p.name));
  const name = BOT_NAMES.find((n) => !used.has(n + " 🤖")) || "Gép " + (bots.length + 1);
  const pid = "bot" + crypto.randomBytes(5).toString("hex");
  room.players[pid] = { name: name + " 🤖", joined: Date.now(), bot: { level: LEVEL_HU[level] ? level : "medium" } };
  sys(room, `${room.players[pid].name} beszállt (${LEVEL_HU[room.players[pid].bot.level]}).`);
  return pid;
}
function sys(room, text) { room.chat.push({ id: ++room.seq, sys: true, text, at: Date.now() }); room.chat = room.chat.slice(-60); }

function viewFor(room, pid) {
  const g = room.game;
  return {
    t: "state", code: room.code, host: room.host, me: pid,
    players: Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, { name: p.name, online: (room.socks.has(id) && room.socks.get(id).size > 0) || !!p.bot, bot: p.bot ? p.bot.level : null, joined: p.joined }])),
    chat: room.chat,
    botGames: BOT_GAMES,
    game: g ? { type: g.type, name: GAMES[g.type].name, by: g.by, startedAt: g.startedAt, v: GAMES[g.type].view(g.st, pid, room) } : null,
    now: Date.now(),
  };
}
function broadcast(room) {
  room.touched = Date.now();
  for (const [pid, set] of room.socks) {
    const msg = JSON.stringify(viewFor(room, pid));
    for (const ws of set) if (ws.readyState === 1) ws.send(msg);
  }
}
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

function attach(ws, room, pid) {
  if (!room.socks.has(pid)) room.socks.set(pid, new Set());
  room.socks.get(pid).add(ws);
  ws.room = room; ws.pid = pid;
}
function detach(ws) {
  const room = ws.room; if (!room) return;
  const set = room.socks.get(ws.pid);
  if (set) { set.delete(ws); if (!set.size) room.socks.delete(ws.pid); }
  // ha a gazda elment, az első online játékos lesz az új gazda
  if (room.host === ws.pid && !room.socks.has(ws.pid)) {
    const next = [...room.socks.keys()][0];
    if (next) { room.host = next; sys(room, `${room.players[next].name} lett a gazda.`); }
  }
  broadcast(room);
}

function handle(ws, m) {
  if (m.t === "ping") return send(ws, { t: "pong" });
  if (m.t === "hello") {
    if (!pidOk(m.pid)) return send(ws, { t: "err", msg: "Hibás azonosító, frissítsd az oldalt." });
    const name = clean(m.name, 20); if (!name) return send(ws, { t: "err", msg: "Írd be a neved." });
    let room;
    if (m.create) room = makeRoom(m.pid);
    else {
      room = rooms.get(String(m.code || "").toUpperCase());
      if (!room) return send(ws, { t: "err", msg: "Nincs ilyen szoba. Lehet, hogy lejárt, nyiss újat.", gone: true });
    }
    if (ws.room && ws.room !== room) detach(ws);
    const fresh = !room.players[m.pid];
    if (fresh && Object.keys(room.players).length >= 16) return send(ws, { t: "err", msg: "Megtelt a szoba (16 fő)." });
    const old = room.players[m.pid];
    room.players[m.pid] = { name, joined: old ? old.joined : Date.now() };
    if (!room.socks.has(room.host)) room.host = m.pid;
    attach(ws, room, m.pid);
    if (fresh) sys(room, `${name} belépett.`);
    return broadcast(room);
  }
  const room = ws.room, pid = ws.pid;
  if (!room) return send(ws, { t: "err", msg: "Előbb lépj be egy szobába." });
  if (m.t === "chat") {
    const text = clean(m.text, 300); if (!text) return;
    room.chat.push({ id: ++room.seq, pid, text, at: Date.now() }); room.chat = room.chat.slice(-60);
    return broadcast(room);
  }
  if (m.t === "addbot") {
    try { addBot(room, m.level); } catch (e) { return send(ws, { t: "err", msg: e.message }); }
    return broadcast(room);
  }
  if (m.t === "rmbot") {
    const p = room.players[m.pid]; if (!p || !p.bot) return;
    const g = room.game;
    if (g && g.st.seats) for (const k of [1, 2]) if (g.st.seats[k] === m.pid) g.st.seats[k] = null;
    sys(room, `${p.name} kiszállt.`); delete room.players[m.pid]; return broadcast(room);
  }
  if (m.t === "botsit") {
    const g = room.game; if (!g || !g.st.seats) return;
    const k = m.seat === 2 ? 2 : 1; if (g.st.seats[k]) return;
    let bot = Object.keys(room.players).find((p) => room.players[p].bot && g.st.seats[1] !== p && g.st.seats[2] !== p);
    try { if (!bot) bot = addBot(room, m.level || "medium"); } catch (e) { return send(ws, { t: "err", msg: e.message }); }
    try { GAMES[g.type].act(g.st, bot, { a: "sit", seat: k }, room); } catch {}
    return broadcast(room);
  }
  if (m.t === "rename") { const n = clean(m.name, 20); if (n) { room.players[pid].name = n; broadcast(room); } return; }
  if (m.t === "start") {
    const G = GAMES[m.game]; if (!G) return send(ws, { t: "err", msg: "Ismeretlen játék." });
    const curOver = room.game && GAMES[room.game.type].over && GAMES[room.game.type].over(room.game.st);
    if (room.game && !curOver && room.host !== pid && room.game.by !== pid) return send(ws, { t: "err", msg: "Már megy egy játék. A gazda vagy az indító zárhatja le." });
    const online = Object.keys(room.players).filter((p) => room.socks.has(p) || room.players[p].bot).length;
    if (online < G.min) return send(ws, { t: "err", msg: `Ehhez legalább ${G.min} játékos kell.` });
    if (m.game === "hangman" && m.opts && m.opts.bot && !Object.values(room.players).some((p) => p.bot)) { try { addBot(room, "medium"); } catch {} }
    try { room.game = { type: G.id, by: pid, startedAt: Date.now(), st: G.create(room, m.opts || {}, pid) }; }
    catch (e) { return send(ws, { t: "err", msg: e.message }); }
    sys(room, `${room.players[pid].name} elindította: ${G.name}.`);
    return broadcast(room);
  }
  if (m.t === "end") {
    if (!room.game) return;
    if (room.host !== pid && room.game.by !== pid) return send(ws, { t: "err", msg: "Csak a gazda vagy az indító zárhatja le." });
    sys(room, `${room.players[pid].name} lezárta a játékot.`);
    room.game = null; return broadcast(room);
  }
  if (m.t === "act") {
    if (!room.game) return;
    try { GAMES[room.game.type].act(room.game.st, pid, m, room); }
    catch (e) { return send(ws, { t: "err", msg: e.message }); }
    return broadcast(room);
  }
}

// ---- HTTP: statikus fájlok ----
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "") || "index.html";
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("Nem található"); }
  res.writeHead(200, { "content-type": (TYPES[path.extname(f)] || "application/octet-stream") + "; charset=utf-8", "cache-control": p === "index.html" ? "no-cache" : "public, max-age=120" });
  fs.createReadStream(f).pipe(res);
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  let bucket = 30, last = Date.now(); // egyszerű áradás elleni védelem
  ws.on("message", (buf) => {
    const t = Date.now(); bucket = Math.min(30, bucket + (t - last) / 100); last = t;
    if (bucket < 1) return; bucket--;
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m && typeof m === "object") { try { handle(ws, m); } catch (e) { console.error(e); } }
  });
  ws.on("close", () => detach(ws));
});
// időzített játékesemények (lejáró idő, következő kérdés, stb.)
setInterval(() => {
  const t = Date.now();
  for (const room of rooms.values()) {
    const g = room.game; if (!g || !room.socks.size) continue;
    const G = GAMES[g.type];
    let ch = false;
    try { if (G.tick && G.tick(g.st, t, room)) ch = true; } catch (e) { console.error("tick", e); }
    try { if (botStep(room, t)) ch = true; } catch (e) { console.error("bots", e); }
    if (ch) broadcast(room);
  }
}, 250);

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  const now = Date.now();
  for (const [code, r] of rooms) if (!r.socks.size && now - r.touched > 3 * 3600e3) rooms.delete(code);
}, 25000);

server.listen(PORT, () => console.log(`Haveri játékok: http://localhost:${PORT}`));
