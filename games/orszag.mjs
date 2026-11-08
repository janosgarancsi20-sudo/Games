// Ország-város-fiú-lány – ugyanaz a szabálylogika, mint a Netlify-os változatban (ovfl-logic.mjs).
// A gépi javítást a Netlify-on futó /api/judge végzi (JUDGE_URL + JUDGE_KEY környezeti változók).
import crypto from "node:crypto";
import { DEFAULT_CATS, POOL, STOP_SECS, START_SECS, norm, startsOk, deadline, evaluate, totals } from "./ovfl-logic.mjs";

const err = (m) => { throw new Error(m); };
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
const recentLetters = []; // a szerver összes szobájában legutóbb húzott betűk

const ctrl = (s, pid, room) => pid === s.owner || pid === room.host;

async function runCheck(s, room, n) {
  const r = s.rounds[n]; if (!r || r.chkDone || r.checking) return;
  const merge = r.merge !== false;
  const items = [], seen = {};
  Object.values(s.ans[n] || {}).forEach((a) => (r.cats || []).forEach((c, ci) => {
    const w = String((a.a || {})[ci] || "").trim(), k = ci + "|" + norm(w, merge);
    if (!w || seen[k] || (r.chk && r.chk[k]) || !startsOk(w, r.letter, r.strict, merge)) return;
    seen[k] = 1; items.push({ k, cat: c, w });
  }));
  if (!items.length) { r.chkDone = true; r.chkErr = ""; room.push?.(); return; }
  const url = process.env.JUDGE_URL, key = process.env.JUDGE_KEY;
  if (!url || !key) { r.chkErr = "Az automatikus javítás nincs beállítva. A gazda kézzel javíthat: koppints a pipára vagy az X-re."; room.push?.(); return; }
  r.checking = true; room.push?.();
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
    const res = await fetch(url, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-judge-key": key }, body: JSON.stringify({ letter: r.letter, strict: r.strict, merge, items }) });
    clearTimeout(to);
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.chk) throw new Error("judge " + res.status);
    r.chk = { ...(r.chk || {}), ...d.chk }; r.chkDone = true; r.chkErr = "";
  } catch (e) {
    console.error("orszag check", e.message);
    r.chkErr = "A javítás nem sikerült. Nyomd meg a „Javítás újra” gombot.";
  }
  r.checking = false; room.push?.();
}

export const orszag = {
  id: "orszag", name: "Ország-város", min: 2,
  create(room, opts, pid) {
    return { owner: pid, status: "lobby", round: 0, letter: "", cats: DEFAULT_CATS.slice(), mode: "classic", strict: true, merge: true, time: 120,
      startAt: 0, endsAt: 0, stopAt: 0, stopBy: "", used: [], hist: [], base: 0, rounds: {}, ans: {} };
  },
  act(s, pid, m, room) {
    const a = m.a;
    if (a === "settings") {
      if (!ctrl(s, pid, room)) err("Ezt csak a gazda állíthatja.");
      if (s.status !== "lobby" && s.status !== "final") err("Kör közben nem lehet beállítani.");
      if (Array.isArray(m.cats)) { const cats = [...new Set(m.cats.map((c) => clean(c, 24)).filter(Boolean))].slice(0, 12); if (cats.length) s.cats = cats; }
      if ([0, 60, 90, 120, 180].includes(m.time)) s.time = m.time;
      if (m.mode === "classic" || m.mode === "family") s.mode = m.mode;
      if (typeof m.strict === "boolean") s.strict = m.strict;
      if (typeof m.merge === "boolean") s.merge = m.merge;
      return;
    }
    if (a === "start") {
      if (!ctrl(s, pid, room)) err("A kört a gazda indítja.");
      if (s.status === "playing") return;
      const recent = recentLetters.slice(-10);
      let used = s.used.slice();
      let avail = POOL.filter((l) => !used.includes(l));
      if (!avail.length) { const last = s.hist.slice(-8); used = []; avail = POOL.filter((l) => !last.includes(l)); }
      const fresh = avail.filter((l) => !recent.includes(l));
      const from = fresh.length >= 3 ? fresh : avail;
      const letter = from[crypto.randomInt(from.length)];
      used.push(letter); s.hist = s.hist.concat([letter]).slice(-40); recentLetters.push(letter); if (recentLetters.length > 20) recentLetters.shift();
      const n = s.round + 1, startAt = Date.now() + START_SECS * 1000;
      s.rounds[n] = { n, letter, cats: s.cats.slice(), mode: s.mode, strict: s.strict, merge: s.merge, chk: {}, ov: {}, points: {}, final: false, chkDone: false, chkErr: "", checking: false };
      s.ans = { [n]: {} };
      Object.assign(s, { status: "playing", round: n, letter, used, startAt, endsAt: s.time ? startAt + s.time * 1000 : 0, stopAt: 0, stopBy: "" });
      return;
    }
    if (a === "ans") {
      if (s.status !== "playing" || m.round !== s.round || Date.now() > deadline(s) + 2000) return;
      const out = {}; (s.rounds[s.round].cats || []).forEach((c, i) => { const v = clean((m.v || {})[i], 40); if (v) out[i] = v; });
      s.ans[s.round][pid] = { pid, a: out }; return;
    }
    if (a === "stop") {
      if (s.status !== "playing" || s.stopAt || Date.now() < s.startAt) return;
      if (m.force && !ctrl(s, pid, room)) err("Csak a gazda zárhatja le a kört.");
      s.stopAt = Date.now() + STOP_SECS * 1000; s.stopBy = pid; return;
    }
    if (a === "recheck") { const r = s.rounds[s.round]; if (s.status !== "review" || !r) return; r.chkErr = ""; r.chkDone = false; runCheck(s, room, s.round); return; }
    if (a === "override") {
      if (!ctrl(s, pid, room)) err("Ezt csak a gazda teheti meg.");
      const r = s.rounds[s.round]; if (!r || s.status !== "review") return;
      if (typeof m.key !== "string" || !/^[A-Za-z0-9]+\|\d+$/.test(m.key)) return;
      r.ov[m.key] = !!m.val; return;
    }
    if (a === "record") {
      if (!ctrl(s, pid, room)) err("A pontokat a gazda rögzíti.");
      if (s.status !== "review") return;
      const r = s.rounds[s.round]; r.points = evaluate(r, s.ans[s.round] || {}).points; r.final = true; s.status = "lobby"; return;
    }
    if (a === "end") { if (!ctrl(s, pid, room)) err("Ezt csak a gazda teheti meg."); if (s.status === "lobby") s.status = "final"; return; }
    if (a === "newparty") { if (!ctrl(s, pid, room)) err("Ezt csak a gazda teheti meg."); s.status = "lobby"; s.base = s.round; return; }
  },
  tick(s, now, room) {
    if (s.status === "playing" && now >= deadline(s) + 2500) {
      s.status = "review"; setTimeout(() => runCheck(s, room, s.round), 300); return true;
    }
    return false;
  },
  view(s, pid, room) {
    const rounds = {};
    Object.entries(s.rounds).forEach(([k, r]) => { rounds[k] = +k === s.round ? r : { n: r.n, letter: r.letter, final: r.final, points: r.points }; });
    const g = { owner: s.owner, ctrl: ctrl(s, pid, room), status: s.status, round: s.round, letter: s.letter, cats: s.cats, mode: s.mode, strict: s.strict, merge: s.merge, time: s.time,
      startAt: s.startAt, endsAt: s.endsAt, stopAt: s.stopAt, stopBy: s.stopBy, base: s.base, rounds, players: room.players };
    const out = { g, totals: totals(g) };
    const ans = s.ans[s.round] || {};
    if (s.status === "playing") { out.filled = Object.fromEntries(Object.values(ans).map((x) => [x.pid, Object.keys(x.a).length])); out.mine = ans[pid] ? ans[pid].a : null; }
    else if (s.status === "review") out.answers = ans;
    return out;
  },
};
