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
  // skip SW on a dev port so cached files never mask fresh edits
  if ('serviceWorker' in navigator && !location.port) navigator.serviceWorker.register('./sw.js');
}

init();
