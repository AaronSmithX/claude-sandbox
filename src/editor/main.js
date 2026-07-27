import { STAGES } from '../levels.js';
import { GLYPHS } from '../glyphs.js';
import { checkStage } from '../level-checks.js';
import { parseDraft, formatDraft, stageSource, STARTER_DRAFT } from './draft.js';
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

/** How long after the last keystroke the level is rebuilt. */
const REBUILD_DELAY = 250;

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
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return STARTER_DRAFT;
  try {
    return { ...STARTER_DRAFT, ...JSON.parse(saved) };
  } catch {
    // A draft we cannot read is not worth a broken page.
    return STARTER_DRAFT;
  }
}

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
    list.append(item(problem, true));
  }
  for (const check of checks) {
    if (check.problems.length === 0) {
      list.append(item(check.label, false));
      continue;
    }
    for (const problem of check.problems) {
      list.append(item(problem, true, check.label));
    }
  }

  problemsPanel.replaceChildren(list);
}

/**
 * @param {string} text
 * @param {boolean} bad
 * @param {string} [label] the check this came from, when the sentence alone does not
 *   say — "the star at 7,5 is walled off" needs no heading, "no star" reads better
 *   under one.
 */
function item(text, bad, label) {
  const li = document.createElement('li');
  li.classList.toggle('is-bad', bad);
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

// --- Loading and copying ----------------------------------------------------

picker.append(new Option('Load a stage…', '', true, true));
STAGES.forEach((stage, index) => picker.append(new Option(stage.name, String(index))));

picker.addEventListener('change', () => {
  if (picker.value === '') return; // the prompt itself, picked again
  const stage = STAGES[Number(picker.value)];
  if (!stage) return;
  writeDraft(formatDraft(stage));
  picker.selectedIndex = 0; // it is a verb, not a state
  onEditNow();
  preview.frame(); // a different map wants a different view
});

need('copy').addEventListener('click', async () => {
  const { stage } = parseDraft(readDraft());
  try {
    await navigator.clipboard.writeText(stageSource(stage));
    say('Copied — paste it into src/levels.js');
  } catch {
    say('The browser would not give up the clipboard');
  }
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
