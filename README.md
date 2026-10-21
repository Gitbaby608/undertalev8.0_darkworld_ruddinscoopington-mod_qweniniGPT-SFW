# 🌈 Rainbow Neighbourhood Mayhem

A browser game deployed with **GitHub Pages**. No build step — Pages serves the repo root verbatim.

## Structure
- `index.html` — thin DOM shell; styles in `css/style.css`; code as ES modules under `src/` (entry: `src/main.js`).
- `.nojekyll` disables Jekyll processing (Pages would otherwise mangle/ignore files starting with `_`).
- Audio is remote-only (`BGM_SRC` / `SHEEP_SRC` URL lists in `src/data.js`). Each list is tried in order and ends with a silent WAV data-URI, so loading always resolves. There are no local-file audio features.

## Playing locally
Any static server works, e.g.:
```
npx serve .        # or: python3 -m http.server
```
(ES modules need http:// — opening `index.html` via file:// will not load `src/`.)

## Enabling GitHub Pages
`.github/workflows/pages.yml` deploys automatically on push to `main` (checkout → upload-pages-artifact path `.` → deploy-pages). Alternatively: Repo → **Settings → Pages** → Source: **Deploy from a branch** → branch + `/ (root)`.

## Testing
```
npm test           # jsdom smoke test: boots the module graph with mocked 2D/WebGL contexts
```
See `AGENTS.md` for architecture notes and verification details.
