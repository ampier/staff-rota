# Rohe Hostel Graafik

Staff schedule for **Rohe Hostel**. Short name: **Rohe Graafik**.

Reception admins keep the rota, and other teams (housekeeping, kitchen, and anyone else on the floor) each have their own people and months. The seeded **Vastuvõtt** team replaces monthly PDFs like **Graafik - Oktoober 2026**.

Phone layout comes first: the month is a day list with large shift buttons, and the team switcher sits above it. A wide window shows the seven-column calendar with the people panel on the left.

Pure static HTML/CSS/JS — no build step, no backend, no auth.

## Open on Mac

**Option A — double-click / Finder**

```bash
open /path/to/staff-rota/index.html
```

Or Finder → open `index.html` in Safari/Chrome. `localStorage` works on `file://`.

**Option B — local server (recommended)**

```bash
cd /path/to/staff-rota
python3 -m http.server 8765
open http://127.0.0.1:8765/
```

## Features

- **Month calendar** with colour-coded shifts (08–14 / 14–20 / 20–08 / 08–20)
- **Täna** — when the open month contains today’s date (browser local timezone), that day gets a blue border, tint, and a “Täna” label. A past or future month has no today highlight
- **Multi-month storage** — switching months keeps each month’s data; add / clear / delete months
- **Loo järgmine kuu** — next calendar month from the one on screen:
  - **Tühi mall** — same weekday shift slots, names cleared
  - **Nädalapäevade muster** — copy the previous month’s weekday assignments (cycles if the new month has more of that weekday)
  - **Õiglane rotatsioon** — fills those slots evenly, skips availability-rule breaks and vacations written in the dialog (e.g. `RENE 1-7`); overlaps, rule breaks, and vacation clashes stay highlighted
- **Meeskonnad** — switch, add, rename, or delete a team; each team has its own people, notes, and months. Vastuvõtt starts from the October 2026 seed
- **People** — add/remove, filter, availability rules (presets + custom windows, overnight-aware). Each name shows hours on the open month; a shift that crosses midnight (20–08) counts as 12 h, and empty or N/A slots count as nothing
- **Edit** — click slot (Esc / Ctrl⌘Enter); empty vs **N/A**; templates; copy/paste day; duplicate to next day; copy week → next week
- **Conflicts** — same person overlapping times highlighted; free / busy / conflict pills
- **Import** — paste `pdftotext` or upload `.txt`; seed October 2026
- **Kalender (.ics)** — no accounts or OAuth. **Kuu ICS** downloads the open month (everyone, or only people checked in the sidebar). Each person has **Minu graafik**. **Impordi ICS** pastes or uploads a file, matches people by name, and adds or fills shifts; unknown names and clashes are listed and skipped
- **Export** — JSON, CSV, A4-friendly printable HTML (always light)
- **Dark mode** — system preference by default; toolbar cycles system → light → dark (persisted). Dark backgrounds are a soft slate, lighter than near-black, with the same text and accent colours
- **Persist** — `localStorage` (`staff-rota-v2`; older saves become the Vastuvõtt team)

## Seed data

From `docs/graafik-oktoober-2026.pdf` via `pdftotext`.

People: GAREN, RENE, IRINA, KRIS-CELIN, VIKTORIA, NETE, NICHOLAS.  
Lipupäev: 17.10 — Hõimupäev.

## Deploy (free static host)

Paths are relative; include `.nojekyll` for GitHub Pages.

### GitHub Pages

This repository is published from the **`main`** branch, folder **`/ (root)`**. `.nojekyll` is in the root so Pages serves the files as-is (no Jekyll). Paths in `index.html` are relative.

**Live site:** https://ampier.github.io/staff-rota/

If the site is not up yet, enable it once:

1. **Settings → Pages → Build and deployment → Deploy from a branch**
2. Branch: `main`, folder: `/ (root)` → Save
3. Wait for the Pages build, then open https://ampier.github.io/staff-rota/

### Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → connect the GitHub repo.
2. Build settings: **Framework preset = None**, build command empty, **output directory** = `/` (or the folder that contains `index.html`).
3. Deploy. Custom domain optional.

No Node/npm required. Optional: any static host (Netlify, Surge, etc.) that serves `index.html`.

## Project layout

```
staff-rota/
  index.html
  .nojekyll
  css/styles.css
  js/seed.js
  js/app.js
  docs/          # source PDF + extracted text
  README.md
```

## Non-goals

No multi-user sync, auth, Slack, or OCR (import text from `pdftotext`).
