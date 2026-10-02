# Graafik — staff rota

Self-contained staff schedule web app for Rene (Estonia). Replaces monthly PDF schedules like **Graafik - Oktoober 2026**.

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
- **Multi-month storage** — switching months keeps each month’s data; add / clear / delete months
- **Loo järgmine kuu** — from the open month, create the next calendar month as an empty schedule, a shift-time template (no people), or a weekday pattern copied from the previous month (1st Monday → 1st Monday). People outside their availability are left blank; overlapping assignments stay and show as conflicts
- **People** — add/remove, filter, availability rules (presets + custom windows, overnight-aware)
- **Edit** — click slot (Esc / Ctrl⌘Enter); empty vs **N/A**; templates; copy/paste day; duplicate to next day; copy week → next week
- **Conflicts** — same person overlapping times highlighted; free / busy / conflict pills
- **Import** — paste `pdftotext` or upload `.txt`; seed October 2026
- **Export** — JSON, CSV, A4-friendly printable HTML (always light)
- **Dark mode** — system preference by default; toolbar cycles system → light → dark (persisted)
- **Persist** — `localStorage` (`staff-rota-v2`; migrates v1)

## Seed data

From `docs/graafik-oktoober-2026.pdf` via `pdftotext`.

People: GAREN, RENE, IRINA, KRIS-CELIN, VIKTORIA, NETE, NICHOLAS.  
Lipupäev: 17.10 — Hõimupäev.

## Deploy (free static host)

Paths are relative; include `.nojekyll` for GitHub Pages.

### GitHub Pages

This repository is published from the **`main`** branch, folder **`/ (root)`**. `.nojekyll` is in the root so Pages serves the files as-is (no Jekyll).

**Live site:** https://ampier.github.io/staff-rota/

If the site is not up yet, enable it once:

1. **Settings → Pages → Build and deployment → Deploy from a branch**
2. Branch: `main`, folder: `/ (root)` → Save
3. Wait for the Pages build, then open https://ampier.github.io/staff-rota/

```bash
git add .
git commit -m "Graafik staff rota"
git push -u origin main
```

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
