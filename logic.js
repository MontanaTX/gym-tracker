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
