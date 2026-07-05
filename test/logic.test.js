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
  assert.equal(weekStreak(s, new Date(2026, 6, 4)), 3);   // Jul 4: three straight weeks incl. current
  assert.equal(weekStreak(s, new Date(2026, 6, 8)), 3);   // Jul 8: next week, nothing yet — still 3
  assert.equal(weekStreak(s, new Date(2026, 6, 15)), 0);  // Jul 15: a full missed week breaks it
  assert.equal(weekStreak([], new Date(2026, 6, 4)), 0);
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

// --- starter plan ---
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
