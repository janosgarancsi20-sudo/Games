# Haveri játékok

Közös játékoldal haverokkal, belépés nélkül, csevegővel. 14 játék:
Ország-város (gépi javítással), Rajzolós, Kvíz, Aknakereső, Passziánsz-verseny, Barkóba, Amőba, Akasztófa, Négy a sorban, Torpedó, Memória, Kockapóker, Kő-papír-olló, Reakcióidő.

Az Ország-város javítását a Netlify-on futó `/api/judge` végzi: Renderen állítsd be a `JUDGE_URL` és `JUDGE_KEY` környezeti változókat (a kulcs ugyanaz, mint a Netlify `JUDGE_KEY` változója). Nélkülük a gazda kézzel javít.

## Futtatás

```bash
npm install
npm start      # http://localhost:8080  (PORT változóval állítható)
```

Node.js 20+ kell. Egyetlen folyamat, a szobák a memóriában vannak (3 óra tétlenség után törlődnek).

## Render

- Runtime: Node · Build: `npm install` · Start: `npm start` · Plan: Free
- A free szolgáltatás 15 perc tétlenség után elalszik, az első betöltés ilyenkor kb. 1 perc.

## Felépítés

- `server.mjs` – HTTP + WebSocket (`/ws`), szobák, csevegő
- `games/index.mjs` – a játékok szabályai a szerveren
- `public/` – a felület (`app.js`, `games.js`, `solitaire.js`, `style.css`)
