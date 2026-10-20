# 🌈 Rainbow Neighbourhood Mayhem

A single-file browser game, deployed with **GitHub Pages**.

## How it works on GitHub Pages
- The game lives at `index.html` at the repo root, so Pages serves it automatically at
  `https://<user>.github.io/<repo>/` — no build step needed.
- `.nojekyll` disables Jekyll processing (Pages would otherwise mangle/ignore files starting with `_`).
- Audio sources are remote URLs (myinstants) plus optional local fallbacks `bgm.mp3` / `sheep.mp3`.
  Those fallbacks are tried only if you add them to the repo; missing files fail gracefully.
  Remote audio may be blocked by CORS/mixed-content depending on the host — use the in-game
  **🔗 URL** or **LOAD BGM / LOAD SHEEP** buttons (files are persisted in IndexedDB).

## Enabling GitHub Pages
1. Push this branch to GitHub (default branch recommended).
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → select your branch + `/ (root)` → Save.
3. Or add `.github/workflows/pages.yml` (included) and Pages deploys on every push automatically.

## Optional workflow deploy
`.github/workflows/pages.yml` uses the official `actions/deploy-pages` setup. Set the repo
permission `Actions: Read and write` is not required for Pages; just push and check the Actions tab.
