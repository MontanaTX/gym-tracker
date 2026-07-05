# Gym Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline-capable phone web app (PWA) where Dave ticks off gym exercises, swaps to a backup when a machine is busy, and reviews workout history.

**Architecture:** Static single-page app, no build step, no server. Vanilla ES modules: pure logic in `logic.js` (unit-tested with `node --test`), IndexedDB key-value storage with localStorage fallback in `storage.js`, all UI in `app.js`. Service worker caches the shell for offline gym use. Hosted on GitHub Pages; data never leaves the phone.

**Tech Stack:** Vanilla JS (ES modules), IndexedDB, Service Worker, `node:test` for unit tests, GitHub Pages for hosting.

**Spec:** `docs/2026-07-05-gym-tracker-design.md`

## File structure

| File | Responsibility |
|---|---|
| `package.json` | `type: module` + `npm test` script (needed so `node --test` loads ESM) |
| `logic.js` | Pure functions: A/B alternation, week stats, streak, last-weight hint, draft creation, busy-swap, import validation. No DOM, no storage. |
| `default-plan.js` | Starter plan data (Workouts A & B with backups) |
| `storage.js` | `kvGet`/`kvSet` over IndexedDB, localStorage fallback |
| `app.js` | UI: render Today/History/Edit, event delegation, export/import |
| `index.html`, `style.css` | Shell + mobile-first dark styling |
| `manifest.json`, `sw.js`, `icons/` | PWA install + offline |
| `scripts/make-icons.py` | Generates PNG icons (pure stdlib, no PIL) |
| `test/logic.test.js` | Unit tests for `logic.js` and starter-plan shape |

Data model:

```js
// plan
{ workouts: [{ id, name, exercises: [{ id, primary: {name, target}, backup: {name, target} }] }] }
// session (and draft, minus id/finishedAt)
{ id, workoutId, workoutName, startedAt, finishedAt,
  entries: [{ exerciseId, name, target, usedBackup, done, weight }] }
```

Storage keys: `plan`, `sessions` (array), `draft` (in-progress session or null).

---

### Task 1: Scaffold

**Files:** Create `package.json`, `.gitignore`

- [ ] **Step 1: Write files**

`package.json`:
```json
{
  "name": "gym-tracker",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test test/" }
}
```

`.gitignore`:
```
.DS_Store
node_modules/
```

- [ ] **Step 2: Commit**
```bash
git add package.json .gitignore && git commit -m "chore: scaffold"
```

---

### Task 2: Pure logic (TDD)

**Files:** Create `test/logic.test.js`, `logic.js`

- [ ] **Step 1: Write the failing tests** — `test/logic.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weekKey, nextWorkoutId, workoutsThisWeek, weekStreak,
  lastWeightFor, newDraft, toggleBackup, validateExportData,
} from '../logic.js';

const plan = { workouts: [{ id: 'a', name: 'A', exercises: [] }, { id: 'b', name: 'B', exercises: [] }] };
// local-noon ISO string — keeps weekKey math immune to timezone edges
const iso = (y, m, d) => new Date(y, m - 1, d, 12).toISOString();
const sess = (workoutId, finishedAt, entries = []) =>
  ({ id: finishedAt, workoutId, workoutName: workoutId, startedAt: finishedAt, finishedAt, entries });

test('weekKey maps any day to its Monday', () => {
  assert.equal(weekKey(new Date(2026, 6, 5)), '2026-06-29');  // Sun Jul 5 → Mon Jun 29
  assert.equal(weekKey(new Date(2026, 5, 29)), '2026-06-29'); // Monday maps to itself
});

test('nextWorkoutId: first ever session is workout A', () => {
  assert.equal(nextWorkoutId(plan, []), 'a');
});

test('nextWorkoutId alternates from the most recent session', () => {
  assert.equal(nextWorkoutId(plan, [sess('a', iso(2026, 7, 1))]), 'b');
  // most recent by finishedAt wins regardless of array order
  assert.equal(nextWorkoutId(plan, [sess('b', iso(2026, 7, 3)), sess('a', iso(2026, 7, 1))]), 'a');
});

test('nextWorkoutId falls back to first workout if last id no longer exists', () => {
  assert.equal(nextWorkoutId(plan, [sess('deleted', iso(2026, 7, 1))]), 'a');
});

test('workoutsThisWeek counts only current week', () => {
  const s = [sess('a', iso(2026, 6, 28)), sess('b', iso(2026, 6, 29)), sess('a', iso(2026, 7, 4))];
  assert.equal(workoutsThisWeek(s, new Date(2026, 6, 5)), 2); // Jun 29 + Jul 4; Jun 28 is prior week
});

test('weekStreak counts consecutive weeks; empty current week does not break it', () => {
  const s = [sess('a', iso(2026, 6, 15)), sess('b', iso(2026, 6, 24)), sess('a', iso(2026, 6, 29))];
  assert.equal(weekStreak(s, new Date(2026, 7, 4)), 3);   // three straight weeks incl. current
  assert.equal(weekStreak(s, new Date(2026, 7, 8)), 3);   // next week, nothing yet — still 3
  assert.equal(weekStreak(s, new Date(2026, 7, 15)), 0);  // a full missed week breaks it
  assert.equal(weekStreak([], new Date(2026, 7, 4)), 0);
});

test('lastWeightFor returns most recent done weight for exact exercise name', () => {
  const s = [
    sess('a', iso(2026, 7, 1), [{ exerciseId: 'x', name: 'Leg press', done: true, weight: '90' }]),
    sess('a', iso(2026, 7, 3), [{ exerciseId: 'x', name: 'Leg press', done: true, weight: '100' }]),
    sess('a', iso(2026, 7, 4), [{ exerciseId: 'x', name: 'Leg press', done: false, weight: '999' }]),
  ];
  assert.equal(lastWeightFor(s, 'Leg press'), '100'); // undone entry ignored
  assert.equal(lastWeightFor(s, 'Chest press'), null);
});

test('newDraft builds unticked entries from primary exercises', () => {
  const w = { id: 'a', name: 'A', exercises: [{ id: 'e1', primary: { name: 'Leg press', target: '2 × 10–12' }, backup: { name: 'Goblet squat', target: '2 × 10–12' } }] };
  const d = newDraft(w, '2026-07-05T10:00:00Z');
  assert.equal(d.workoutId, 'a');
  assert.equal(d.startedAt, '2026-07-05T10:00:00Z');
  assert.deepEqual(d.entries, [{ exerciseId: 'e1', name: 'Leg press', target: '2 × 10–12', usedBackup: false, done: false, weight: '' }]);
});

test('toggleBackup swaps to backup and back, preserving done/weight', () => {
  const ex = { id: 'e1', primary: { name: 'Leg press', target: '2 × 10–12' }, backup: { name: 'Goblet squat', target: '2 × 12' } };
  const entry = { exerciseId: 'e1', name: 'Leg press', target: '2 × 10–12', usedBackup: false, done: true, weight: '90' };
  const swapped = toggleBackup(entry, ex);
  assert.deepEqual(swapped, { ...entry, name: 'Goblet squat', target: '2 × 12', usedBackup: true });
  assert.deepEqual(toggleBackup(swapped, ex), entry);
});

test('toggleBackup is a no-op when no backup is defined', () => {
  const ex = { id: 'e1', primary: { name: 'Plank', target: '2 × 30s' }, backup: { name: '', target: '' } };
  const entry = { exerciseId: 'e1', name: 'Plank', target: '2 × 30s', usedBackup: false, done: false, weight: '' };
  assert.equal(toggleBackup(entry, ex), entry);
});

test('validateExportData accepts good data, rejects junk', () => {
  const good = { plan: { workouts: [{ id: 'a', name: 'A', exercises: [] }] }, sessions: [sess('a', iso(2026, 7, 1))] };
  assert.equal(validateExportData(good), true);
  assert.equal(validateExportData(null), false);
  assert.equal(validateExportData({}), false);
  assert.equal(validateExportData({ plan: { workouts: 'nope' }, sessions: [] }), false);
  assert.equal(validateExportData({ plan: { workouts: [] }, sessions: [{ entries: [] }] }), false); // session missing finishedAt
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL (cannot find module `../logic.js`)

- [ ] **Step 3: Write minimal implementation** — `logic.js`:

```js
// Pure logic — no DOM, no storage. Everything here is unit-tested.

export function weekKey(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - (x.getDay() + 6) % 7); // back to Monday
  const p = n => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

function prevWeekKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return weekKey(new Date(y, m - 1, d - 7));
}

function byFinish(sessions) {
  return [...sessions].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
}

export function nextWorkoutId(plan, sessions) {
  const ids = plan.workouts.map(w => w.id);
  const ordered = byFinish(sessions);
  const last = ordered[ordered.length - 1];
  if (!last) return ids[0];
  return ids[(ids.indexOf(last.workoutId) + 1) % ids.length];
}

export function workoutsThisWeek(sessions, now) {
  const k = weekKey(now);
  return sessions.filter(s => weekKey(new Date(s.finishedAt)) === k).length;
}

export function weekStreak(sessions, now) {
  const weeks = new Set(sessions.map(s => weekKey(new Date(s.finishedAt))));
  let k = weekKey(now);
  if (!weeks.has(k)) k = prevWeekKey(k); // an empty current week doesn't break the streak yet
  let streak = 0;
  while (weeks.has(k)) { streak++; k = prevWeekKey(k); }
  return streak;
}

export function lastWeightFor(sessions, exerciseName) {
  const ordered = byFinish(sessions);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const hit = ordered[i].entries.find(e => e.done && e.name === exerciseName && e.weight);
    if (hit) return hit.weight;
  }
  return null;
}

export function newDraft(workout, startedAt) {
  return {
    workoutId: workout.id,
    workoutName: workout.name,
    startedAt,
    entries: workout.exercises.map(ex => ({
      exerciseId: ex.id,
      name: ex.primary.name,
      target: ex.primary.target,
      usedBackup: false,
      done: false,
      weight: '',
    })),
  };
}

export function toggleBackup(entry, exercise) {
  const to = entry.usedBackup ? exercise.primary : exercise.backup;
  if (!to || !to.name) return entry;
  return { ...entry, usedBackup: !entry.usedBackup, name: to.name, target: to.target };
}

export function validateExportData(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.plan || !Array.isArray(data.plan.workouts)) return false;
  if (!Array.isArray(data.sessions)) return false;
  for (const w of data.plan.workouts) {
    if (typeof w.id !== 'string' || typeof w.name !== 'string' || !Array.isArray(w.exercises)) return false;
  }
  for (const s of data.sessions) {
    if (typeof s.finishedAt !== 'string' || !Array.isArray(s.entries)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: all tests PASS

- [ ] **Step 5: Commit**
```bash
git add logic.js test/ && git commit -m "feat: workout logic with unit tests"
```

---

### Task 3: Starter plan data (TDD)

**Files:** Create `default-plan.js`; Modify `test/logic.test.js` (append)

- [ ] **Step 1: Append failing test** to `test/logic.test.js`:

```js
import { defaultPlan } from '../default-plan.js';

test('default plan: 2 workouts, every exercise has a primary and a backup', () => {
  assert.equal(defaultPlan.workouts.length, 2);
  assert.equal(validateExportData({ plan: defaultPlan, sessions: [] }), true);
  for (const w of defaultPlan.workouts) {
    assert.ok(w.exercises.length >= 6);
    for (const ex of w.exercises) {
      assert.ok(ex.id && ex.primary.name && ex.primary.target, `${w.name}: primary complete`);
      assert.ok(ex.backup.name !== undefined && ex.backup.target !== undefined);
    }
  }
  const ids = defaultPlan.workouts.flatMap(w => w.exercises.map(e => e.id));
  assert.equal(new Set(ids).size, ids.length, 'exercise ids unique');
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL (module not found)

- [ ] **Step 3: Write** `default-plan.js`:

```js
// Starter plan: conservative return-to-training, Crunch-standard equipment.
// Every working exercise: 2 sets of 10–12, add weight when both sets feel easy.
const ex = (id, pName, pTarget, bName, bTarget) =>
  ({ id, primary: { name: pName, target: pTarget }, backup: { name: bName, target: bTarget } });

export const defaultPlan = {
  workouts: [
    {
      id: 'a',
      name: 'Workout A',
      exercises: [
        ex('a1', 'Warm-up: treadmill walk (brisk, slight incline)', '8 min', 'Stationary bike', '8 min'),
        ex('a2', 'Leg press', '2 × 10–12', 'Dumbbell goblet squat', '2 × 10–12'),
        ex('a3', 'Chest press machine', '2 × 10–12', 'Dumbbell bench press', '2 × 10–12'),
        ex('a4', 'Seated cable row', '2 × 10–12', 'One-arm dumbbell row', '2 × 10–12 each'),
        ex('a5', 'Shoulder press machine', '2 × 10–12', 'Seated dumbbell press', '2 × 10–12'),
        ex('a6', 'Plank', '2 × 30s', 'Dead bug', '2 × 10 each side'),
        ex('a7', 'Cool-down: easy walk', '5 min', '', ''),
      ],
    },
    {
      id: 'b',
      name: 'Workout B',
      exercises: [
        ex('b1', 'Warm-up: stationary bike', '8 min', 'Treadmill walk', '8 min'),
        ex('b2', 'Leg curl + leg extension', '2 × 10–12 each', 'Dumbbell Romanian deadlift', '2 × 10–12'),
        ex('b3', 'Lat pulldown', '2 × 10–12', 'Assisted pull-up machine', '2 × 8–10'),
        ex('b4', 'Incline chest press machine', '2 × 10–12', 'Incline dumbbell press', '2 × 10–12'),
        ex('b5', 'Cable face pull', '2 × 12–15', 'Dumbbell rear-delt fly', '2 × 12–15'),
        ex('b6', 'Pallof press (cable)', '2 × 10 each side', 'Side plank', '2 × 20s each side'),
        ex('b7', 'Cool-down: easy walk', '5 min', '', ''),
      ],
    },
  ],
};
```

- [ ] **Step 4: Run** `npm test` — Expected: all PASS

- [ ] **Step 5: Commit**
```bash
git add default-plan.js test/ && git commit -m "feat: starter A/B plan with busy backups"
```

---

### Task 4: Storage wrapper

**Files:** Create `storage.js` (browser-only APIs — verified in Task 6's preview checks, not unit-testable under node)

- [ ] **Step 1: Write** `storage.js`:

```js
// Tiny key-value store: IndexedDB first, localStorage fallback.
const DB = 'gym-tracker', STORE = 'kv';
let dbPromise = null;

function openDb() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet(key) {
  try {
    const v = await idb('readonly', s => s.get(key));
    return v === undefined ? null : v;
  } catch {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }
}

export async function kvSet(key, value) {
  try {
    await idb('readwrite', s => s.put(value, key));
  } catch {
    localStorage.setItem(key, JSON.stringify(value)); // throws visibly if this also fails
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add storage.js && git commit -m "feat: IndexedDB kv storage with localStorage fallback"
```

---

### Task 5: Shell — HTML + CSS

**Files:** Create `index.html`, `style.css`; Modify `../.claude/launch.json` (add server entry)

- [ ] **Step 1: Write** `index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0d1117">
<link rel="manifest" href="./manifest.json">
<link rel="apple-touch-icon" href="./icons/icon-180.png">
<link rel="stylesheet" href="./style.css">
<title>Gym Tracker</title>
</head>
<body>
<header>
  <h1>Gym Tracker</h1>
  <div id="stats"></div>
</header>
<div id="banner" hidden></div>
<main id="view"></main>
<nav id="tabs">
  <button data-tab="today" class="active">Today</button>
  <button data-tab="history">History</button>
  <button data-tab="edit">Edit</button>
</nav>
<script type="module" src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write** `style.css`:

```css
:root {
  --bg: #0d1117; --card: #161b22; --line: #30363d;
  --fg: #f0f6fc; --dim: #8b949e; --green: #3fb950; --accent: #2f81f7;
}
* { box-sizing: border-box; margin: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg); color: var(--fg);
  font: 17px/1.4 -apple-system, system-ui, sans-serif;
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
}
header {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px;
}
h1 { font-size: 20px; }
h2 { font-size: 18px; margin: 4px 16px 12px; }
#stats { color: var(--dim); font-size: 14px; }
#banner {
  position: fixed; top: 10px; left: 16px; right: 16px; z-index: 10;
  background: var(--accent); color: #fff; padding: 12px 16px;
  border-radius: 10px; text-align: center;
}
#view { padding: 4px 12px; }
.empty { color: var(--dim); text-align: center; padding: 48px 24px; }

/* bottom nav */
#tabs {
  position: fixed; bottom: 0; left: 0; right: 0; display: flex;
  background: var(--card); border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
}
#tabs button {
  flex: 1; padding: 16px 0; background: none; border: none;
  color: var(--dim); font: inherit; font-size: 15px;
}
#tabs button.active { color: var(--accent); font-weight: 600; }

/* buttons */
.btn {
  display: block; width: 100%; margin: 10px 0; padding: 16px;
  border-radius: 12px; border: 1px solid var(--line);
  background: var(--card); color: var(--fg); font: inherit; font-weight: 600;
}
.btn.primary { background: var(--green); border-color: var(--green); color: #04260f; }
.btn.ghost { background: none; color: var(--dim); font-weight: 400; }

/* today cards */
.card {
  display: flex; align-items: center; gap: 10px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: 12px; padding: 12px; margin: 8px 0;
}
.card.done { border-color: var(--green); }
.card.done .name { color: var(--dim); text-decoration: line-through; }
.tick {
  flex: none; width: 44px; height: 44px; border-radius: 50%;
  border: 2px solid var(--line); background: none;
  color: #04260f; font-size: 22px; font-weight: 700;
}
.card.done .tick { background: var(--green); border-color: var(--green); }
.ex { flex: 1; min-width: 0; }
.name { font-weight: 600; overflow-wrap: anywhere; }
.target { color: var(--dim); font-size: 14px; }
.tag {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 5px;
}
input.weight {
  flex: none; width: 74px; padding: 10px 8px; text-align: center;
  background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
  color: var(--fg); font: inherit;
}
.swap {
  flex: none; width: 44px; height: 44px; border-radius: 10px;
  border: 1px solid var(--line); background: none; color: var(--accent); font-size: 20px;
}

/* history */
.session {
  background: var(--card); border: 1px solid var(--line);
  border-radius: 12px; padding: 12px 14px; margin: 8px 0;
}
.session-head { display: flex; align-items: center; gap: 6px; }
.session-head .del { margin-left: auto; background: none; border: none; color: var(--dim); font-size: 20px; padding: 4px 8px; }
.session ul { margin: 8px 0 0 18px; color: var(--dim); font-size: 15px; }

/* edit */
.workout { margin: 12px 0 20px; }
.w-name {
  width: 100%; padding: 12px; font: inherit; font-weight: 700; font-size: 18px;
  background: var(--card); color: var(--fg); border: 1px solid var(--line); border-radius: 10px;
}
.ex-row {
  display: flex; gap: 8px; background: var(--card);
  border: 1px solid var(--line); border-radius: 12px; padding: 10px; margin: 8px 0;
}
.ex-fields { flex: 1; display: grid; grid-template-columns: 1fr 110px; gap: 6px; min-width: 0; }
.ex-fields input {
  padding: 10px; font: inherit; font-size: 15px; min-width: 0;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 8px;
}
.ex-btns { display: flex; flex-direction: column; gap: 4px; }
.ex-btns button {
  width: 40px; flex: 1; background: none; border: 1px solid var(--line);
  border-radius: 8px; color: var(--dim); font-size: 16px;
}
.data-actions { margin: 24px 0; }
```

- [ ] **Step 3: Add dev server** to `/Users/dmontana/Claude Code/.claude/launch.json` configurations array:

```json
{ "name": "gym-tracker", "runtimeExecutable": "python3", "runtimeArgs": ["-m", "http.server", "4173", "-d", "/Users/dmontana/Claude Code/gym-tracker"], "port": 4173 }
```

- [ ] **Step 4: Verify shell renders** — needs `app.js` to exist; do after Task 6. Commit HTML/CSS now:
```bash
git add index.html style.css && git commit -m "feat: app shell and mobile styling"
```

---

### Task 6: App UI (`app.js`) + preview verification

**Files:** Create `app.js`

- [ ] **Step 1: Write** `app.js` (complete):

```js
import {
  nextWorkoutId, workoutsThisWeek, weekStreak, lastWeightFor,
  newDraft, toggleBackup, validateExportData,
} from './logic.js';
import { defaultPlan } from './default-plan.js';
import { kvGet, kvSet } from './storage.js';

let plan, sessions, draft, tab = 'today';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function banner(msg) {
  const b = $('#banner');
  b.textContent = msg;
  b.hidden = false;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.hidden = true; }, 3500);
}

async function save(key, val) {
  try { await kvSet(key, val); }
  catch { banner('Storage error — your last change may not have saved.'); }
}

const workoutById = id => plan.workouts.find(w => w.id === id);

function render() {
  const now = new Date();
  $('#stats').textContent =
    `${workoutsThisWeek(sessions, now)} this week · ${weekStreak(sessions, now)}-wk streak`;
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  ({ today: renderToday, history: renderHistory, edit: renderEdit })[tab]();
}

function renderToday() {
  const v = $('#view');
  if (!draft) {
    const nextId = nextWorkoutId(plan, sessions);
    v.innerHTML = `<div class="start">
      <p class="empty">Ready when you are.</p>
      ${plan.workouts.map(w => `
        <button class="btn ${w.id === nextId ? 'primary' : ''}" data-action="start" data-workout="${w.id}">
          Start ${esc(w.name)}${w.id === nextId ? ' — up next' : ''}
        </button>`).join('')}
    </div>`;
    return;
  }
  const done = draft.entries.filter(e => e.done).length;
  v.innerHTML = `
    <h2>${esc(draft.workoutName)}</h2>
    ${draft.entries.map((e, i) => `
      <div class="card ${e.done ? 'done' : ''}">
        <button class="tick" data-action="toggle" data-i="${i}" aria-label="mark done">${e.done ? '✓' : ''}</button>
        <div class="ex">
          <div class="name">${esc(e.name)} ${e.usedBackup ? '<span class="tag">backup</span>' : ''}</div>
          <div class="target">${esc(e.target)}</div>
        </div>
        <input class="weight" type="text" inputmode="decimal" data-action="weight" data-i="${i}"
               value="${esc(e.weight)}" placeholder="${esc(lastWeightFor(sessions, e.name) ?? 'wt')}">
        <button class="swap" data-action="swap" data-i="${i}" aria-label="busy — swap exercise">⇄</button>
      </div>`).join('')}
    <button class="btn primary" data-action="finish">Finish workout (${done}/${draft.entries.length})</button>
    <button class="btn ghost" data-action="cancel">Discard workout</button>`;
}

function renderHistory() {
  const v = $('#view');
  if (!sessions.length) {
    v.innerHTML = '<p class="empty">No workouts yet. Your first one is waiting on the Today tab.</p>';
    return;
  }
  const sorted = [...sessions].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  v.innerHTML = sorted.map(s => {
    const done = s.entries.filter(e => e.done);
    const when = new Date(s.finishedAt).toLocaleDateString(undefined,
      { weekday: 'short', month: 'short', day: 'numeric' });
    return `<div class="session">
      <div class="session-head">
        <strong>${when}</strong>&nbsp;· ${esc(s.workoutName)} · ${done.length}/${s.entries.length}
        <button class="del" data-action="del-session" data-id="${s.id}" aria-label="delete session">×</button>
      </div>
      <ul>${done.map(e => `<li>${esc(e.name)}${e.usedBackup ? ' <span class="tag">backup</span>' : ''}${e.weight ? ` — ${esc(e.weight)}` : ''}</li>`).join('')}</ul>
    </div>`;
  }).join('');
}

function renderEdit() {
  $('#view').innerHTML = plan.workouts.map((w, wi) => `
    <div class="workout">
      <input class="w-name" value="${esc(w.name)}" data-action="w-name" data-w="${wi}" aria-label="workout name">
      ${w.exercises.map((ex, i) => `
        <div class="ex-row">
          <div class="ex-fields">
            <input value="${esc(ex.primary.name)}" placeholder="Exercise" data-action="ex-field" data-w="${wi}" data-i="${i}" data-field="primary.name">
            <input value="${esc(ex.primary.target)}" placeholder="Sets × reps" data-action="ex-field" data-w="${wi}" data-i="${i}" data-field="primary.target">
            <input value="${esc(ex.backup.name)}" placeholder="Backup (if busy)" data-action="ex-field" data-w="${wi}" data-i="${i}" data-field="backup.name">
            <input value="${esc(ex.backup.target)}" placeholder="Backup sets × reps" data-action="ex-field" data-w="${wi}" data-i="${i}" data-field="backup.target">
          </div>
          <div class="ex-btns">
            <button data-action="move" data-w="${wi}" data-i="${i}" data-dir="-1" aria-label="move up">↑</button>
            <button data-action="move" data-w="${wi}" data-i="${i}" data-dir="1" aria-label="move down">↓</button>
            <button data-action="del-ex" data-w="${wi}" data-i="${i}" aria-label="delete exercise">✕</button>
          </div>
        </div>`).join('')}
      <button class="btn" data-action="add-ex" data-w="${wi}">+ Add exercise</button>
    </div>`).join('') + `
    <div class="data-actions">
      <button class="btn" data-action="export">Export backup</button>
      <button class="btn" data-action="import">Import backup</button>
      <input id="import-file" type="file" accept="application/json,.json" hidden>
    </div>`;
}

async function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, i, w } = el.dataset;

  if (action === 'start') {
    draft = newDraft(workoutById(el.dataset.workout), new Date().toISOString());
    await save('draft', draft);
    return render();
  }
  if (action === 'toggle') {
    draft.entries[i].done = !draft.entries[i].done;
    await save('draft', draft);
    return render();
  }
  if (action === 'swap') {
    const entry = draft.entries[i];
    const ex = workoutById(draft.workoutId)?.exercises.find(x => x.id === entry.exerciseId);
    if (!ex || !((entry.usedBackup ? ex.primary : ex.backup)?.name)) return banner('No backup set for this exercise — add one in Edit.');
    draft.entries[i] = toggleBackup(entry, ex);
    await save('draft', draft);
    return render();
  }
  if (action === 'finish') {
    const done = draft.entries.filter(en => en.done).length;
    if (!done && !confirm('Nothing ticked — finish anyway?')) return;
    sessions.push({ ...draft, id: crypto.randomUUID(), finishedAt: new Date().toISOString() });
    draft = null;
    await save('sessions', sessions);
    await save('draft', null);
    banner('Workout saved 💪');
    return render();
  }
  if (action === 'cancel') {
    if (!confirm('Discard this workout?')) return;
    draft = null;
    await save('draft', null);
    return render();
  }
  if (action === 'del-session') {
    if (!confirm('Delete this workout from history?')) return;
    sessions = sessions.filter(s => s.id !== el.dataset.id);
    await save('sessions', sessions);
    return render();
  }
  if (action === 'move') {
    const list = plan.workouts[w].exercises;
    const j = Number(i) + Number(el.dataset.dir);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await save('plan', plan);
    return render();
  }
  if (action === 'del-ex') {
    if (!confirm('Delete this exercise?')) return;
    plan.workouts[w].exercises.splice(i, 1);
    await save('plan', plan);
    return render();
  }
  if (action === 'add-ex') {
    plan.workouts[w].exercises.push({
      id: crypto.randomUUID(),
      primary: { name: '', target: '2 × 10–12' },
      backup: { name: '', target: '2 × 10–12' },
    });
    await save('plan', plan);
    render();
    const rows = document.querySelectorAll(`[data-w="${w}"][data-field="primary.name"]`);
    return rows[rows.length - 1]?.focus();
  }
  if (action === 'export') {
    const data = { app: 'gym-tracker', version: 1, exportedAt: new Date().toISOString(), plan, sessions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  if (action === 'import') return $('#import-file').click();
}

async function onInput(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, i, w } = el.dataset;
  // no re-render on text input — it would steal focus mid-typing
  if (action === 'weight') {
    draft.entries[i].weight = el.value;
    await save('draft', draft);
  } else if (action === 'w-name') {
    plan.workouts[w].name = el.value;
    await save('plan', plan);
  } else if (action === 'ex-field') {
    const [part, field] = el.dataset.field.split('.');
    plan.workouts[w].exercises[i][part][field] = el.value;
    await save('plan', plan);
  }
}

async function onImportFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return banner('That file is not valid JSON.'); }
  if (!validateExportData(data)) return banner('That file is not a Gym Tracker backup.');
  if (!confirm(`Replace current plan and history with backup (${data.sessions.length} sessions)?`)) return;
  plan = data.plan;
  sessions = data.sessions;
  await save('plan', plan);
  await save('sessions', sessions);
  banner('Backup restored.');
  render();
}

async function init() {
  plan = await kvGet('plan') ?? structuredClone(defaultPlan);
  sessions = await kvGet('sessions') ?? [];
  draft = await kvGet('draft');
  $('#view').addEventListener('click', onClick);
  $('#view').addEventListener('input', onInput);
  $('#view').addEventListener('change', e => { if (e.target.id === 'import-file') onImportFile(e); });
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { tab = b.dataset.tab; render(); }
  });
  render();
  if ('serviceWorker' in navigator && !location.port) navigator.serviceWorker.register('./sw.js');
}

init();
```

Note the service-worker registration is skipped on a port (local dev) so cached files never mask fresh edits during verification.

- [ ] **Step 2: Verify with preview** — `preview_start` name `gym-tracker`, `preview_resize` mobile, then:
  1. Snapshot: Today shows "Start Workout A — up next".
  2. Click start → 7 exercise cards render.
  3. Click tick on card 1 → card gets `done` class, Finish counter reads 1/7.
  4. Click swap on card 2 → name changes to "Dumbbell goblet squat" + backup tag; swap again → back.
  5. Fill weight "90" on card 2, tick it, Finish → banner "Workout saved 💪", Today shows "Start Workout B — up next".
  6. History tab: 1 session, ticked exercises listed, weight shown.
  7. Start Workout B... wait — Today now offers B as next; start it, swap-tick leg curl, check weight placeholder on a repeated exercise later. Simpler: start A again via its button, confirm "Leg press"-analog weight placeholder shows 90 → actually weight was on card 2 (goblet squat swap). Placeholder check: start Workout A, card 2 swapped state resets to primary; swap card 2 → placeholder shows "90".
  8. Reload page mid-draft: start a workout, tick one, reload → draft still shown (resume works).
  9. Console: no errors.
- [ ] **Step 3: Fix anything found, re-verify**
- [ ] **Step 4: Commit**
```bash
git add app.js && git commit -m "feat: today/history/edit UI with busy-swap and draft resume"
```

---

### Task 7: Edit & export/import verification

**Files:** none new — browser verification of Task 6 code

- [ ] **Step 1: Edit tab checks** — rename Workout A (type in field), add exercise, fill its name, move it up, delete it. Reload page → rename persisted.
- [ ] **Step 2: Export/import round-trip** — via `preview_eval`: click export is a download (skip file assert); instead simulate import path: `validateExportData` already unit-tested, so verify UI wiring only — click Import opens file input (check via eval that `#import-file` exists and click dispatches). Then eval-inject: build `{app,version,plan,sessions}` object from current state, call the import validation path indirectly by checking `JSON.parse(JSON.stringify(...))` shape passes. Minimum bar: no console errors on Export click.
- [ ] **Step 3: Commit any fixes**
```bash
git add -A && git commit -m "fix: edit/export issues found in verification" # only if changes
```

---

### Task 8: PWA — manifest, icons, service worker

**Files:** Create `manifest.json`, `sw.js`, `scripts/make-icons.py`, `icons/icon-180.png`, `icons/icon-512.png`

- [ ] **Step 1: Write** `manifest.json`:

```json
{
  "name": "Gym Tracker",
  "short_name": "Gym",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0d1117",
  "theme_color": "#0d1117",
  "icons": [
    { "src": "icons/icon-180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Write** `scripts/make-icons.py` (pure stdlib PNG writer — dark background, white bar, green plates):

```python
#!/usr/bin/env python3
"""Generate app icons without PIL: solid background + simple barbell."""
import os, struct, zlib

BG, PLATE, BAR = (13, 17, 23), (63, 185, 80), (240, 246, 252)

def make(size, path):
    px = [[BG] * size for _ in range(size)]
    def rect(x0, y0, x1, y1, c):
        for y in range(max(0, int(y0)), min(size, int(y1))):
            for x in range(max(0, int(x0)), min(size, int(x1))):
                px[y][x] = c
    cy = size / 2
    rect(size * .12, cy - size * .03, size * .88, cy + size * .03, BAR)          # bar
    for cx, h in ((.24, .46), (.35, .34)):                                       # plates, both sides
        for side in (cx, 1 - cx):
            rect(size * side - size * .045, cy - size * h / 2,
                 size * side + size * .045, cy + size * h / 2, PLATE)
    raw = b''.join(b'\x00' + b''.join(bytes(px[y][x]) for x in range(size)) for y in range(size))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(path, os.path.getsize(path), 'bytes')

os.makedirs('icons', exist_ok=True)
make(180, 'icons/icon-180.png')
make(512, 'icons/icon-512.png')
```

- [ ] **Step 3: Run it**: `python3 scripts/make-icons.py` — Expected: two files written, sizes printed. Read `icons/icon-180.png` with the Read tool to eyeball the barbell.

- [ ] **Step 4: Write** `sw.js`:

```js
const CACHE = 'gym-tracker-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './logic.js',
  './default-plan.js', './storage.js', './manifest.json',
  './icons/icon-180.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
  );
});
```

(Cache-busting on future updates: bump `CACHE` version string in the same commit as any asset change.)

- [ ] **Step 5: Verify** — reload preview; console shows no SW errors (registration is intentionally skipped on localhost port). Manifest link resolves (network tab 200 for manifest.json, icons).

- [ ] **Step 6: Commit**
```bash
git add manifest.json sw.js scripts/ icons/ && git commit -m "feat: PWA manifest, icons, offline service worker"
```

---

### Task 9: Deploy to GitHub Pages

**Files:** none (git/gh operations)

- [ ] **Step 1: Check auth**: `gh auth status` — if not logged in, STOP and ask the user to run `gh auth login`.
- [ ] **Step 2: Create repo + push** (public repo required for free Pages; app code only, no personal data):
```bash
gh repo create gym-tracker --public --source . --push --description "Personal gym workout tracker PWA"
```
- [ ] **Step 3: Enable Pages**:
```bash
gh api -X POST repos/{owner}/gym-tracker/pages -f 'source[branch]=main' -f 'source[path]=/'
```
(owner from `gh api user -q .login`; if Pages API returns 409 it's already enabled — fine.)
- [ ] **Step 4: Wait for build then verify**: poll `gh api repos/{owner}/gym-tracker/pages -q .status` until `built`, then `curl -sI https://{owner}.github.io/gym-tracker/ | head -1` — Expected: `HTTP/2 200`.

---

### Task 10: README + final check

**Files:** Create `README.md`

- [ ] **Step 1: Write** `README.md` — what it is, the live URL, install steps (Safari → Share → Add to Home Screen), backup/restore notes, `npm test`, and the update procedure (edit → bump `CACHE` in `sw.js` → push).
- [ ] **Step 2: Run** `npm test` — all PASS.
- [ ] **Step 3: Commit + push**
```bash
git add README.md && git commit -m "docs: readme with install and update instructions" && git push
```

## Self-review notes

- Spec coverage: Today (Task 6), busy-swap (T2/T6), optional weight + last-weight hint (T2/T6), history + week stats/streak (T2/T6), edit (T6/T7), export/import (T6/T7), draft resume (T6 step 2.8), offline/PWA (T8), hosting/install (T9/T10), starter plan (T3). Body-weight log intentionally absent (out of scope).
- Type consistency: entry fields `{exerciseId, name, target, usedBackup, done, weight}` used identically in logic.js, tests, and app.js; storage keys `plan`/`sessions`/`draft` consistent.
- `sessions` sorted defensively inside logic functions, so callers never need pre-sorted input.
