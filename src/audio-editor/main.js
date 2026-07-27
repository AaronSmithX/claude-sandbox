import { SCORE_SOURCES } from '../audio/index.js';
import { checkScore } from '../audio/score-checks.js';
import { parseDraft, offsetOf, discardedScore, STARTER_SCORE, STARTER_NAME } from './draft.js';
import { layout, paint, hitTest, trackColor } from './roll.js';
import { Transport } from './transport.js';

/**
 * The music editor: the score on the left, what it sounds like on the right.
 *
 * Everything here is wiring. The rules of the format are in `../audio/score.js`, the
 * rules of a good score are in `../audio/score-checks.js`, drawing one is `./roll.js`
 * and playing one is `./transport.js`. This file owns the DOM, the debounce, and the
 * draft that survives a reload.
 *
 * It is the level editor's shape applied to sound, down to the two-tier verdict: the
 * parser's complaint if the text will not read at all, and the checks underneath it
 * for a score that reads but will not loop.
 */

const STORAGE_KEY = 'tile-runner.audio-editor.draft';

/**
 * Where a message waits out a reload.
 *
 * Saving writes a file under `src/audio/scores/`, which this page imports with `?raw`,
 * so Vite reloads it a moment later — taking the toast that said the save worked with
 * it. Handing the sentence to the next page load instead means the one thing Save has
 * to tell you actually gets told. The level editor does the same, for the same reason.
 */
const SAID_KEY = 'tile-runner.audio-editor.said';

/** How long after the last keystroke the score is rebuilt. */
const REBUILD_DELAY = 250;

/** @param {string} id */
function need(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`audio-editor.html is missing #${id}`);
  return element;
}

const source = /** @type {HTMLTextAreaElement} */ (need('source'));
const nameField = /** @type {HTMLInputElement} */ (need('field-name'));
const picker = /** @type {HTMLSelectElement} */ (need('score-picker'));
const problemsPanel = need('problems');
const canvas = /** @type {HTMLCanvasElement} */ (need('roll'));
const trackList = need('tracks');
const playButton = need('play');
const toast = need('toast');

const transport = new Transport();

/** The last score that parsed — what is drawn and played while a typo is on screen. */
let showing = parseDraft(STARTER_SCORE).score;

/** @type {ReturnType<typeof layout> | null} */
let view = null;

// --- Rebuilding -------------------------------------------------------------

/**
 * Text to score, and text to verdict.
 *
 * A score that fails a check is still played — being able to hear the thing that is
 * wrong is the whole reason the roll is there. Only text the parser refuses outright
 * leaves the last good score playing, and the panel says why.
 */
function rebuild() {
  const { score, problems } = parseDraft(source.value);
  if (score) {
    showing = score;
    transport.setScore(score);
  }
  paintProblems(problems, score ? checkScore(score) : []);
  drawTracks();
  draw();
}

/**
 * @param {string[]} problems things wrong with the text itself
 * @param {import('../audio/score-checks.js').Check[]} checks things wrong with the score
 */
function paintProblems(problems, checks) {
  const list = document.createElement('ul');
  for (const problem of problems) list.append(item(problem, true));
  for (const check of checks) {
    if (check.problems.length === 0) {
      list.append(item(check.label, false));
      continue;
    }
    for (const problem of check.problems) list.append(item(problem, true, check.label));
  }
  problemsPanel.replaceChildren(list);
}

/**
 * @param {string} text
 * @param {boolean} bad
 * @param {string} [label] the check this came from, when the sentence alone does not say
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

function onEdit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: nameField.value, text: source.value }));
  clearTimeout(pending);
  pending = setTimeout(rebuild, REBUILD_DELAY);
}

/** The same, for a change that was a decision rather than a keystroke. */
function onEditNow() {
  onEdit();
  clearTimeout(pending);
  rebuild();
}

source.addEventListener('input', onEdit);
nameField.addEventListener('input', onEdit);

// --- The roll ---------------------------------------------------------------

/** Lays the score out at the canvas's real size and draws it. */
function draw() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  // Only when it has actually changed. Assigning either of these reallocates the
  // backing store and clears it, and this runs on every frame while the music plays.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx || !showing) return;
  // Everything below is in CSS pixels, which is also what a click arrives in — so the
  // layout `hitTest` searches is the one that was drawn.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  view = layout(showing, { width: rect.width, height: rect.height });
  paint(ctx, view, {
    playhead: transport.playing ? transport.position() : undefined,
    duration: showing.duration,
    isMuted: (name) => transport.isMuted(name),
  });
}

// While it plays the playhead has to move, so the roll is redrawn on the frame clock.
// While it does not, nothing changes on its own and redrawing is on demand only.
function tick() {
  if (transport.playing) draw();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

new ResizeObserver(() => draw()).observe(canvas);

canvas.addEventListener('pointerdown', (event) => {
  if (!view) return;
  const rect = canvas.getBoundingClientRect();
  const block = hitTest(view, event.clientX - rect.left, event.clientY - rect.top);
  if (!block) return;

  // Put the caret on the note that was clicked. Focusing after setting the selection
  // would scroll it into view but drop the selection in some browsers; this order keeps
  // both.
  const offset = offsetOf(source.value, block.note);
  source.focus();
  source.setSelectionRange(offset, offset);
  say(`${view.tracks[block.track].name}, line ${block.note.line}`);
});

// --- Tracks -----------------------------------------------------------------

/** A row per track: its colour, its name, and mute and solo. */
function drawTracks() {
  if (!showing) return;
  const rows = showing.tracks.map((track, index) => {
    const row = document.createElement('div');
    row.className = 'track';

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    // From the roll, not from a second copy of the same sum — the whole point of the
    // colour is that this button and that block are obviously the same track.
    swatch.style.background = trackColor(index);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = track.name;

    const mute = document.createElement('button');
    mute.type = 'button';
    mute.textContent = 'M';
    mute.title = `Mute ${track.name}`;
    mute.setAttribute('aria-pressed', String(transport.muted.has(track.name)));
    mute.addEventListener('click', () => {
      transport.toggleMute(track.name);
      drawTracks();
      draw();
    });

    const solo = document.createElement('button');
    solo.type = 'button';
    solo.textContent = 'S';
    solo.title = `Solo ${track.name}`;
    solo.setAttribute('aria-pressed', String(transport.soloed.has(track.name)));
    solo.addEventListener('click', () => {
      transport.toggleSolo(track.name);
      drawTracks();
      draw();
    });

    row.classList.toggle('is-muted', transport.isMuted(track.name));
    row.append(swatch, name, mute, solo);
    return row;
  });
  trackList.replaceChildren(...rows);
}

// --- Transport --------------------------------------------------------------

function showPlaying() {
  playButton.textContent = transport.playing ? 'Stop' : 'Play';
  playButton.setAttribute('aria-pressed', String(transport.playing));
  document.body.classList.toggle('is-playing', transport.playing);
}

playButton.addEventListener('click', () => {
  transport.toggle();
  showPlaying();
  draw();
});

need('restart').addEventListener('click', () => {
  transport.start();
  showPlaying();
});

need('unmute').addEventListener('click', () => {
  transport.clearMutes();
  drawTracks();
  draw();
});

/** Whether the caret is somewhere that owns the keyboard. */
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');

window.addEventListener('keydown', (event) => {
  // Space is the transport everywhere else, and a space everywhere it has to be — the
  // textarea an inch to the left would be unusable if this were not gated. Same trick
  // as the level editor's movement keys.
  if (typing()) return;
  if (event.code === 'Space') {
    event.preventDefault();
    transport.toggle();
    showPlaying();
    draw();
  }
  if (event.code === 'Escape') {
    transport.stop();
    showPlaying();
    draw();
  }
});

// --- Loading and saving -----------------------------------------------------

picker.append(new Option('Load a score…', '', true, true));
for (const name of Object.keys(SCORE_SOURCES)) picker.append(new Option(name, name));

picker.addEventListener('change', () => {
  const name = picker.value;
  if (!name) return; // the prompt itself, picked again
  source.value = SCORE_SOURCES[name];
  nameField.value = name;
  picker.selectedIndex = 0; // it is a verb, not a state
  transport.clearMutes();
  onEditNow();
});

need('save').addEventListener('click', async () => {
  const name = nameField.value.trim();
  if (!/^[a-z0-9-]+$/.test(name)) {
    say('A score is named in lower case, digits and dashes');
    return;
  }

  const { problems } = parseDraft(source.value);
  if (problems.length) {
    say('That does not parse yet — see the panel');
    return;
  }

  try {
    const response = await fetch('/__score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, text: source.value }),
    });
    if (response.ok) {
      sayAfterReload(await response.text());
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
    await navigator.clipboard.writeText(source.value);
    say(`Copied — paste it into src/audio/scores/${name}.txt`);
  } catch {
    say('The browser would not give up the clipboard');
  }
});

need('discard').addEventListener('click', () => {
  const back = discardedScore(nameField.value, SCORE_SOURCES);
  const started = back.text === STARTER_SCORE ? 'the starting score' : `“${back.name}” as it is on disk`;
  if (!confirm(`Throw away the changes in the box and go back to ${started}?`)) return;

  localStorage.removeItem(STORAGE_KEY);
  source.value = back.text;
  nameField.value = back.name;
  transport.clearMutes();
  onEditNow();
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

// --- Go ---------------------------------------------------------------------

function restore() {
  /** The name matters: see `STARTER_NAME`. A first Save must not land on the theme. */
  const fresh = { name: STARTER_NAME, text: STARTER_SCORE };
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return fresh;
  try {
    return { ...fresh, ...JSON.parse(saved) };
  } catch {
    // A draft we cannot read is not worth a broken page.
    return fresh;
  }
}

const initial = restore();
source.value = initial.text;
nameField.value = initial.name;
showPlaying();
rebuild();

const carried = sessionStorage.getItem(SAID_KEY);
if (carried) {
  sessionStorage.removeItem(SAID_KEY);
  say(carried);
}
