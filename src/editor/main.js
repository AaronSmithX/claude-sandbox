import { STAGES } from '../levels.js';
import { GLYPHS } from '../glyphs.js';
import { checkStage } from '../level-checks.js';
import {
  parseDraft,
  formatDraft,
  stageSource,
  discardedDraft,
  freshDraft,
} from './draft.js';
import { LEVELS_FILE } from './levels-source.js';
import { Preview, LOOK, PLAY } from './preview.js';

/**
 * The level editor: the text on the left, the level it makes on the right.
 *
 * Everything here is wiring. The rules of the format are in `./draft.js`, the rules
 * of a good level are in `../level-checks.js`, and putting one on the screen is
 * `./preview.js` — which is the game's own loading code with the campaign removed.
 * This file owns the DOM, the debounce and the draft that survives a reload.
 */

const STORAGE_KEY = 'tile-runner.editor.draft';

/**
 * Where a message waits out a reload.
 *
 * Saving writes `src/levels.js`, which this page imports, so Vite reloads it a moment
 * later — taking the toast that said the save worked with it. Handing the sentence to
 * the next page load instead means the one thing Save has to tell you actually gets
 * told. `sessionStorage` because it should not outlive the tab.
 */
const SAID_KEY = 'tile-runner.editor.said';

/** How long after the last keystroke the level is rebuilt. */
const REBUILD_DELAY = 250;

/** The dropdown entry that starts a stage from nothing, rather than opening one. */
const NEW = 'new';

/** @param {string} id */
function need(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`editor.html is missing #${id}`);
  return element;
}

const fields = {
  id: /** @type {HTMLInputElement} */ (need('field-id')),
  name: /** @type {HTMLInputElement} */ (need('field-name')),
  hint: /** @type {HTMLInputElement} */ (need('field-hint')),
  grid: /** @type {HTMLTextAreaElement} */ (need('grid')),
  legend: /** @type {HTMLTextAreaElement} */ (need('legend')),
};
const picker = /** @type {HTMLSelectElement} */ (need('stage-picker'));
const problemsPanel = need('problems');
const pane = need('preview');
const modeButton = need('mode');
const modeHint = need('mode-hint');
const toast = need('toast');

const preview = new Preview(pane);

// --- The draft --------------------------------------------------------------

/** @returns {import('./draft.js').Draft} */
const readDraft = () => ({
  id: fields.id.value,
  name: fields.name.value,
  hint: fields.hint.value,
  grid: fields.grid.value,
  legend: fields.legend.value,
});

/** @param {import('./draft.js').Draft} draft */
function writeDraft(draft) {
  fields.id.value = draft.id;
  fields.name.value = draft.name;
  fields.hint.value = draft.hint;
  fields.grid.value = draft.grid;
  fields.legend.value = draft.legend;
}

function restore() {
  const fresh = freshDraft(STAGES);
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return fresh;
  try {
    return { ...fresh, ...JSON.parse(saved) };
  } catch {
    // A draft we cannot read is not worth a broken page.
    return fresh;
  }
}

/**
 * Whether the boxes hold anything worth keeping — that is, anything that differs from
 * what opening the same id again would give you.
 *
 * The point of asking is the check, not the dialog. A draft that already matches the
 * stage on disk, or the blank slate it started from, is not work; confirming it away
 * every time would teach the habit of dismissing the question, and then it would be
 * dismissed on the one occasion it mattered.
 */
function draftIsUnsaved() {
  const now = readDraft();
  const disk = discardedDraft(now.id, STAGES);
  return !(
    now.id.trim() === disk.id.trim() &&
    now.name.trim() === disk.name.trim() &&
    now.hint.trim() === disk.hint.trim() &&
    // The grid keeps its leading spaces — an upper layer is made of them — but a
    // textarea adds a trailing newline that means nothing.
    now.grid.trimEnd() === disk.grid.trimEnd() &&
    now.legend.trim() === disk.legend.trim()
  );
}

/** @param {string} what the sentence up to the question mark */
const keepingNothing = (what) =>
  !draftIsUnsaved() || confirm(`${what}? The changes in these boxes have not been saved.`);

// --- Rebuilding -------------------------------------------------------------

/**
 * Text to level, and text to verdict.
 *
 * A level that fails a check is still shown. Being able to look at the thing that
 * is wrong is the whole reason the preview is there; only a map the parser refuses
 * outright leaves the last good one on the screen, and the panel says why.
 */
function rebuild() {
  const { stage, problems } = parseDraft(readDraft());
  const checks = checkStage(stage);
  paint(problems, checks);

  try {
    preview.load(stage);
  } catch {
    // Unreachable in practice: `checkStage` parses and builds the same stage, so
    // anything that throws here is already the first line of the panel above.
  }
}

/**
 * @param {string[]} problems things wrong with the draft's own text
 * @param {import('../level-checks.js').Check[]} checks things wrong with the level
 */
function paint(problems, checks) {
  const list = document.createElement('ul');

  for (const problem of problems) {
    list.append(item(problem, 'error'));
  }
  for (const check of checks) {
    if (check.problems.length === 0) {
      list.append(item(check.label, 'ok'));
      continue;
    }
    for (const problem of check.problems) {
      list.append(item(problem, check.severity ?? 'error', check.label));
    }
  }

  problemsPanel.replaceChildren(list);
}

/**
 * @param {string} text
 * @param {'ok' | 'warning' | 'error'} tone a warning is still shown in the panel and
 *   still marked, just not in the colour that means the stage is broken.
 * @param {string} [label] the check this came from, when the sentence alone does not
 *   say — "the star at 7,5 is walled off" needs no heading, "no star" reads better
 *   under one.
 */
function item(text, tone, label) {
  const li = document.createElement('li');
  li.classList.toggle('is-bad', tone === 'error');
  li.classList.toggle('is-warn', tone === 'warning');
  if (label) {
    const heading = document.createElement('span');
    heading.className = 'label';
    heading.textContent = `${label}:`;
    li.append(heading, ` ${text}`);
  } else {
    li.append(text);
  }
  return li;
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let pending;

/** Rebuilds once the typing stops, and keeps the draft against a reload meanwhile. */
function onEdit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readDraft()));
  clearTimeout(pending);
  pending = setTimeout(rebuild, REBUILD_DELAY);
}

/** The same, for a change that was a decision rather than a keystroke. */
function onEditNow() {
  onEdit();
  clearTimeout(pending);
  rebuild();
}

for (const field of Object.values(fields)) {
  field.addEventListener('input', onEdit);
}

// --- Loading, saving and discarding -----------------------------------------

picker.append(new Option('Open…', '', true, true));
// "New stage" belongs here rather than on a button of its own: this dropdown is already
// the answer to "where does the draft in these boxes come from", and starting from
// nothing is one of the places it can come from.
picker.append(new Option('New stage', NEW));
const shipped = document.createElement('optgroup');
shipped.label = 'On disk';
STAGES.forEach((stage, index) => shipped.append(new Option(stage.name, String(index))));
picker.append(shipped);

picker.addEventListener('change', () => {
  const chosen = picker.value;
  picker.selectedIndex = 0; // it is a verb, not a state
  if (chosen === '') return; // the prompt itself, picked again

  // `Number(NEW)` is NaN and no array has that index, so the new-stage entry falls
  // through to `undefined` here without needing a branch of its own.
  const stage = STAGES[Number(chosen)];
  if (chosen !== NEW && !stage) return;

  // Opening something else throws away whatever is in the boxes, which is the one
  // irreversible thing this dropdown does — so it asks, on the same terms Discard does.
  if (!keepingNothing(`Open ${stage ? `“${stage.name}”` : 'a new stage'}`)) return;

  writeDraft(stage ? formatDraft(stage) : freshDraft(STAGES));
  onEditNow();
  preview.frame(); // a different map wants a different view
});

need('save').addEventListener('click', async () => {
  const { stage, problems } = parseDraft(readDraft());
  if (problems.length) {
    say('That does not read yet — see the panel');
    return;
  }

  // `checkStage` puts "parses" first and, when it fails, puts nothing after it. A map
  // the tile parser refuses is not a stage, and writing it into `src/levels.js` would
  // break the game and the suite rather than save any work. Everything softer than
  // that — an unreachable star, a door with no key — is saved and mentioned, because
  // a half-built stage is a normal thing to want to keep.
  const checks = checkStage(stage);
  if (checks[0].problems.length > 0) {
    say(`That map will not parse: ${checks[0].problems[0]}`);
    return;
  }
  // Warnings are not counted here: a stage that means to run short of keys would
  // otherwise be told it is unfinished every time it was saved.
  const unfinished = checks.some(
    (check) => check.problems.length > 0 && check.severity !== 'warning',
  );

  try {
    const response = await fetch('/__stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (response.ok) {
      const written = await response.text();
      sayAfterReload(unfinished ? `${written} — the panel still lists problems` : written);
      return;
    }
    // A refusal from an endpoint that is there is worth repeating; anything else falls
    // through to the clipboard below.
    if (response.status !== 404) {
      say(await response.text());
      return;
    }
  } catch {
    // No dev server — the built page on Pages has no endpoint to write with.
  }

  try {
    await navigator.clipboard.writeText(stageSource(stage));
    say(`Copied — paste it into ${LEVELS_FILE}`);
  } catch {
    say('The browser would not give up the clipboard');
  }
});

need('discard').addEventListener('click', () => {
  const back = discardedDraft(fields.id.value, STAGES);
  const onDisk = STAGES.some((stage) => stage.id === back.id);
  const started = onDisk ? `“${back.name}” as it is on disk` : 'a blank stage';
  if (!confirm(`Throw away the changes in these boxes and go back to ${started}?`)) return;

  localStorage.removeItem(STORAGE_KEY);
  writeDraft(back);
  onEditNow();
  preview.frame();
  say('Changes discarded');
});

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** @param {string} text */
function say(text) {
  toast.textContent = text;
  toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 2200);
}

/**
 * Says it now, and again on the other side of the reload the save is about to cause —
 * whichever of the two the author is still here to read.
 *
 * @param {string} text
 */
function sayAfterReload(text) {
  try {
    sessionStorage.setItem(SAID_KEY, text);
  } catch {
    // Private browsing can refuse it. The toast below is still shown; it may just be
    // cut short by the reload.
  }
  say(text);
}

preview.onOutcome = (outcome) =>
  say(outcome === 'won' ? 'Reached the star' : 'Caught by a patrol');

// --- The preview's controls -------------------------------------------------

/**
 * The moves table from `src/input.js`. `setupInput` itself cannot be reused: it takes
 * M, R and Escape off the window whatever else is going on, which would make three
 * letters untypable in the textareas an inch to the left.
 *
 * What replaces that gate here is the mode plus the focus. A key moves the player
 * only while the preview is in play *and* the caret is not in a field — so `d` is a
 * step east over the level and a letter in the hint box, and never both.
 */
const MOVES = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/** @param {typeof LOOK | typeof PLAY} mode */
function setMode(mode) {
  preview.setMode(mode);
  const playing = mode === PLAY;
  modeButton.textContent = playing ? 'Stop' : 'Play';
  modeButton.setAttribute('aria-pressed', String(playing));
  document.body.classList.toggle('is-playing', playing);
  modeHint.textContent = playing
    ? 'Arrow keys or WASD to walk · Esc to stop'
    : 'Drag to orbit, scroll to zoom';
}

modeButton.addEventListener('click', () => setMode(preview.mode === PLAY ? LOOK : PLAY));
need('reset').addEventListener('click', () => preview.reset());
need('fit').addEventListener('click', () => preview.frame());

/** Whether the caret is somewhere that owns the keyboard. */
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');

window.addEventListener('keydown', (e) => {
  if (typing()) return;
  if (e.code === 'Escape') {
    setMode(LOOK);
    return;
  }
  if (preview.mode !== PLAY) return;
  const move = MOVES[e.code];
  if (!move) return;
  e.preventDefault();
  if (e.repeat) return; // the key is already held; the OS repeat has nothing to add
  preview.player?.press(move[0], move[1]);
});

// Letting go is never gated: a key pressed over the level and released after the
// caret has moved into a field must still stop the walking.
window.addEventListener('keyup', (e) => {
  const move = MOVES[e.code];
  if (move) preview.player?.release(move[0], move[1]);
});

// A keyup that lands on another window never reaches us, for the reason src/input.js
// gives: a key held as focus goes away would otherwise walk on forever.
window.addEventListener('blur', () => preview.player?.releaseAll());

// --- Go ---------------------------------------------------------------------

const glyphList = need('glyph-list');
for (const [char, name] of Object.entries(GLYPHS)) {
  const row = document.createElement('div');
  const glyph = document.createElement('b');
  glyph.textContent = char;
  const label = document.createElement('span');
  label.textContent = name;
  row.append(glyph, label);
  glyphList.append(row);
}

writeDraft(restore());
setMode(LOOK);
rebuild();

const carried = sessionStorage.getItem(SAID_KEY);
if (carried) {
  sessionStorage.removeItem(SAID_KEY);
  say(carried);
}
