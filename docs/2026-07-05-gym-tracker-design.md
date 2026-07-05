# Gym Tracker — Design Spec

**Date:** 2026-07-05
**Owner:** Dave Montana
**Status:** Approved (verbally in session)

## Purpose

A phone app Dave uses at Crunch Fitness to tick off each exercise as he does it, with a
one-tap backup exercise when a machine or spot is busy, and a history of past workouts.
Context: returning to training after a TIA, following 11 years of BJJ and a long layoff.
Goals are accountability, rebuilding strength, and losing midsection weight. The app keeps
friction near zero so it never becomes a reason to skip logging.

## Decisions made during brainstorming

- **Starter plan built in** — two alternating full-body workouts (A/B), Crunch-standard
  machines, conservative volume (2×10–12), every exercise paired with a backup.
- **Logging depth:** checkmark per exercise, plus an *optional* weight field. Last-used
  weight shown as a hint next time.
- **No body-weight log** — workouts only.
- **Platform:** iPhone. Progressive web app added to the home screen from Safari.
- **Approach:** single-page web app, no accounts, no server. Hosted on GitHub Pages
  (app code public; workout data never leaves the phone).

## Screens

### Today
- Opens to today's workout; alternates A/B automatically based on the last completed session.
- Each exercise is a card: large checkmark tap target, exercise name, target sets/reps.
- **Busy?** button flips the card to the backup exercise; the checkmark then applies to the
  backup, and history records which one was actually done.
- Optional weight input per exercise, pre-hinted with the weight from the last session that
  included that exercise.
- **Finish workout** saves the session (date, workout name, completed exercises incl. swaps,
  weights) and returns to a summary state.

### History
- Sessions listed most recent first: date, workout (A/B), exercises completed, weights,
  swaps marked.
- Consistency counter at top (e.g. "3 workouts this week", current streak) for accountability.

### Edit
- Add / remove / reorder exercises within each workout.
- Change primary/backup pairing; edit names, sets/reps text.
- Rename workouts.

## Starter plan content

**Workout A:** treadmill walk warm-up (bike) · leg press (goblet squat) · chest press
machine (DB bench press) · seated cable row (one-arm DB row) · shoulder press machine
(seated DB press) · plank 2×30s (dead bug) · cool-down walk.

**Workout B:** bike warm-up (treadmill) · leg curl + leg extension (DB Romanian deadlift) ·
lat pulldown (assisted pull-up machine) · incline chest press machine (incline DB press) ·
cable face pull (DB rear-delt fly) · Pallof press (side plank) · cool-down walk.

Working exercises 2 sets × 10–12; parenthesized = backup.

## Architecture

- **Single-file-ish static app:** `index.html` + `app.js` + `style.css` + `manifest.json` +
  `sw.js` (service worker for offline) + icons. Vanilla JS, no build step, no framework —
  keeps it maintainable in one sitting and instant to load.
- **Storage:** IndexedDB via a thin wrapper (fallback to localStorage if IDB unavailable).
  Two stores: `plan` (current workouts/exercises) and `sessions` (completed workouts).
- **Backup/restore:** Export button downloads a JSON file (share sheet → iCloud Drive);
  Import restores from that file.
- **Offline:** service worker caches the app shell; the app is fully functional with no
  network after first load.
- **State model:** in-progress session held in memory + persisted draft in storage, so an
  accidental app close mid-workout doesn't lose ticks.

## Error handling

- Storage write failures surface a visible banner (not silent).
- Import validates the JSON shape before overwriting anything and confirms first.
- Draft session recovery on relaunch ("Resume workout in progress?").

## Testing

- Local verification via dev-server preview: tick flow, busy-swap flow, finish → history,
  weight hint from prior session, edit-plan flow, export/import round-trip, offline reload.
- Mobile viewport (375×812) is the design target; desktop is incidental.

## Hosting / install

- Public GitHub repo, GitHub Pages from `main`.
- Install: open the Pages URL in Safari → Share → Add to Home Screen.

## Out of scope (YAGNI)

- Accounts, sync, cloud storage of workout data.
- Body-weight tracking, nutrition, timers, rest-interval beeps.
- Multiple plans/programs; there is one plan with two workouts (editable).
