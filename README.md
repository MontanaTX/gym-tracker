# Gym Tracker

A personal workout tracker PWA: tick off each exercise as you do it, swap to a
backup exercise when the machine is busy, and review your workout history.
No accounts, no server — all data stays on the phone (IndexedDB), with JSON
export/import for backup.

## Install on iPhone

1. Open the live URL in **Safari** (see Deployment below).
2. Tap **Share → Add to Home Screen**.
3. Launch it from the home screen — it runs full-screen and works offline.

## Using it

- **Today** — start the suggested workout (A and B alternate automatically).
  Tap the circle to tick an exercise; tap **⇄** if the machine is busy to swap
  to the backup. The weight box is optional and shows last time's weight as a hint.
- **History** — past sessions, newest first, plus weekly count and streak.
- **Edit** — change exercises, targets, and backups; add/remove/reorder;
  **Export backup** saves a JSON file (put it in iCloud Drive), **Import backup** restores it.

## Development

- No build step. Serve the folder statically: `python3 -m http.server 4173 -d .`
- Tests: `npm test` (pure logic in `logic.js` is unit-tested with `node --test`).
- The service worker is skipped on a dev port so edits always show fresh.

## Deployment (GitHub Pages)

Hosted from this repo's `main` branch. To ship an update:

1. Edit files, run `npm test`.
2. **Bump the `CACHE` version string in `sw.js`** (e.g. `gym-tracker-v2`) in the
   same commit — installed phones only pick up changes when the cache name changes.
3. `git push` — Pages redeploys automatically.
