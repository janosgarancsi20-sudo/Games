# Haveri játékok

Közös játékoldal haverokkal, belépés nélkül: **Aknakereső** (közös tábla), **Passziánsz-verseny** (ugyanaz a leosztás mindenkinek), **Barkóba**, **Amőba**, **Akasztófa**, csevegővel.

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
