// Közös játéklogika: a böngésző és a szerver is ezt használja.
export const DEFAULT_CATS = ["Ország", "Város", "Fiú", "Lány", "Növény", "Állat", "Tárgy"];
export const POOL = "ABCDEFGHIJKLMNOPRSTUVZ".split("");
export const DIG = { C: ["cs"], D: ["dzs", "dz"], G: ["gy"], L: ["ly"], N: ["ny"], S: ["sz"], T: ["ty"], Z: ["zs"] };
export const STOP_SECS = 10;
export const START_SECS = 3;

const HU = "\u00e1\u00e9\u00ed\u00f3\u00f6\u0151\u00fa\u00fc\u0171"; // á é í ó ö ő ú ü ű
const LONG = { "\u00e1": "a", "\u00e9": "e", "\u00ed": "i", "\u00f3": "o", "\u0151": "\u00f6", "\u00fa": "u", "\u0171": "\u00fc" };
// merge = true: hosszú és rövid magánhangzó egynek számít (á=a, ú=u, ő=ö…). Az ö/ü sosem azonos az o/u-val.
export const norm = (s, merge = true) =>
  [...String(s || "").normalize("NFC").toLowerCase()]
    .map((ch) => {
      if (HU.includes(ch)) return merge && LONG[ch] ? LONG[ch] : ch;
      return ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    })
    .join("").replace(/\s+/g, " ").trim();

export function startsOk(word, letter, strict, merge = true) {
  const n = norm(word, merge);
  if (!n || !letter) return false;
  if (n[0] !== letter.toLowerCase()) return false;
  if (strict && DIG[letter] && DIG[letter].some((d) => n.startsWith(d))) return false;
  return true;
}

export function deadline(g) {
  const a = [];
  if (g.endsAt) a.push(g.endsAt);
  if (g.stopAt) a.push(g.stopAt);
  return a.length ? Math.min(...a) : Infinity;
}

// r: kör adatai, answers: { pid: { a: { [oszlopIndex]: szó } } }
export function evaluate(r, answers) {
  const cats = r.cats || [];
  const pids = Object.keys(answers || {});
  const res = { cells: {}, points: {} };
  pids.forEach((p) => (res.points[p] = 0));
  cats.forEach((c, ci) => {
    const list = pids.map((p) => {
      const w = String(((answers[p] || {}).a || {})[ci] || "").trim();
      const merge = r.merge !== false;
      const n = norm(w, merge);
      const key = p + "|" + ci;
      const ai = r.chk && r.chk[ci + "|" + n];
      const ov = r.ov && typeof r.ov[key] === "boolean" ? r.ov[key] : null;
      let state, why = "";
      if (!w) state = "empty";
      else if (ov !== null) { state = ov ? "ok" : "bad"; why = ov ? "A gazda elfogadta" : "A gazda nem fogadta el"; }
      else if (!startsOk(w, r.letter, r.strict, merge)) { state = "bad"; why = "Nem " + r.letter + " betűvel kezdődik"; }
      else if (ai) { state = ai.ok ? "ok" : "bad"; why = ai.why || ""; }
      else if (r.chkErr || r.chkDone) { state = "ok"; why = "Nem ellenőrzött"; }
      else state = "wait";
      return { p, w, n, state, why, key };
    });
    const valid = list.filter((x) => x.state === "ok" || x.state === "wait");
    const cnt = {};
    valid.forEach((x) => (cnt[x.n] = (cnt[x.n] || 0) + 1));
    list.forEach((x) => {
      let pts = 0, dup = false;
      if (x.state === "ok" || x.state === "wait") {
        dup = cnt[x.n] > 1;
        if (r.mode === "family") pts = valid.length === 1 ? 20 : dup ? 5 : 10;
        else pts = dup ? 0 : 1;
      }
      x.pts = pts; x.dup = dup;
      res.points[x.p] += pts;
    });
    res.cells[ci] = list;
  });
  return res;
}

export function totals(g) {
  const t = {};
  Object.keys(g.players || {}).forEach((p) => (t[p] = 0));
  const base = g.base || 0;
  Object.values(g.rounds || {}).forEach((r) => {
    if (r.final && r.n > base) Object.entries(r.points || {}).forEach(([p, v]) => (t[p] = (t[p] || 0) + v));
  });
  return t;
}
