/**
 * The editor's text, and the `Stage` it means — in both directions.
 *
 * A draft is five strings, because that is what a textarea holds. Turning them into
 * a stage is the only part of the editor with rules worth arguing about, so it lives
 * here on its own: no DOM, no three.js, and a test file that reads like a spec.
 *
 * Nothing in here validates a map. A draft that parses into a stage may still be a
 * stage the parser rejects — that is `src/tilemap.js`'s job to say, and
 * `src/level-checks.js`'s to collect. What this file reports on is only the two
 * things it can know about: a legend line that is not a binding, and a grid with no
 * rows in it.
 */

/**
 * What a first visit opens with: small, legal, and enough of a level to walk.
 * @type {Draft}
 */
export const STARTER_DRAFT = {
  id: 'new-stage',
  name: 'New Stage',
  hint: 'Reach the <b>star</b>.',
  grid: ['#########', '#@......#', '#.#####.#', '#.#...#.#', '#...#.*.#', '#########'].join(
    '\n',
  ),
  legend: '',
};

/** The line that ends one layer and starts the next: three or more dashes, alone. */
const LAYER_BREAK = /^\s*-{3,}\s*$/;

/** `k = key:rust`, with the glyph as the first non-space character of the line. */
const BINDING = /^(\S)\s*=\s*(\S.*?)\s*$/;

/**
 * @typedef {object} Draft
 * @property {string} id
 * @property {string} name
 * @property {string} hint
 * @property {string} grid   the layers, ground first, separated by a line of `---`
 * @property {string} legend one `char = name` binding per line; `//` starts a comment
 */

/**
 * @typedef {object} ParsedDraft
 * @property {import('../levels.js').Stage} stage
 * @property {string[]} problems what the draft's own text got wrong, as opposed to
 *   what the map does — an empty list is not a promise that the stage is playable.
 */

/**
 * Text to stage.
 *
 * Every layer is taken exactly as typed, trailing spaces and all. A short row on an
 * upper layer is not a mistake — a space up there means "nothing here", so you type
 * the deck and leave the sky alone — and `TileMap` pads them itself. Padding here as
 * well would only mean that a stage could not come back out of the editor looking the
 * way it went in.
 *
 * @param {Draft} draft
 * @returns {ParsedDraft}
 */
export function parseDraft({ id, name, hint, grid, legend }) {
  /** @type {string[]} */
  const problems = [];

  const layers = splitLayers(grid);
  const rows = layers[0] ?? [];
  if (rows.length === 0) problems.push('The grid is empty: a stage needs a row of tiles.');

  const upper = layers.slice(1);

  /** @type {import('../types.js').Legend} */
  const bindings = {};
  let bound = false;
  legend.split('\n').forEach((line, index) => {
    const text = line.trim();
    if (text === '' || text.startsWith('//')) return;
    const match = BINDING.exec(text);
    if (!match) {
      problems.push(`Legend line ${index + 1} is not a binding: "${text}"`);
      return;
    }
    const [, char, value] = match;
    if (value.startsWith('{')) {
      try {
        bindings[char] = JSON.parse(value);
      } catch {
        problems.push(`Legend line ${index + 1} is not valid JSON: "${value}"`);
        return;
      }
    } else {
      bindings[char] = value;
    }
    bound = true;
  });

  /** @type {import('../levels.js').Stage} */
  const stage = { id: id.trim(), name: name.trim(), hint: hint.trim(), rows };
  // Only when there is something to say: most stages have neither, and a stage
  // carrying an empty `upper` or `legend` would round-trip into one that does not
  // look like the ones already in the file.
  if (upper.length > 0) stage.upper = upper;
  if (bound) stage.legend = bindings;

  return { stage, problems };
}

/**
 * Stage to text — what fills the boxes when an existing stage is opened.
 *
 * @param {import('../levels.js').Stage} stage
 * @returns {Draft}
 */
export function formatDraft(stage) {
  const layers = [stage.rows, ...(stage.upper ?? [])];
  return {
    id: stage.id ?? '',
    name: stage.name ?? '',
    hint: stage.hint ?? '',
    grid: layers.map((rows) => rows.join('\n')).join('\n---\n'),
    legend: Object.entries(stage.legend ?? {})
      .map(([char, value]) => `${char} = ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join('\n'),
  };
}

/**
 * A blank slate to start a stage from, under an id no stage on disk is using.
 *
 * The id matters more than it looks. Save decides between replacing a stage and adding
 * one by that id alone, so handing out `new-stage` twice would mean the second level
 * someone authored silently overwrote the first. Numbering from the second keeps the
 * common case — the first new stage on a clean checkout — reading as plain
 * `new-stage`.
 *
 * @param {readonly import('../levels.js').Stage[]} stages what is on disk
 * @returns {Draft}
 */
export function freshDraft(stages) {
  const taken = new Set(stages.map((stage) => stage.id));
  if (!taken.has(STARTER_DRAFT.id)) return STARTER_DRAFT;
  let n = 2;
  while (taken.has(`${STARTER_DRAFT.id}-${n}`)) n++;
  return { ...STARTER_DRAFT, id: `${STARTER_DRAFT.id}-${n}`, name: `${STARTER_DRAFT.name} ${n}` };
}

/**
 * What Discard goes back to: the stage as it is on disk, if the draft is an edit of
 * one, and a blank slate if it is not.
 *
 * The distinction is the whole point of the button. A draft that started as `Thin Ice`
 * is being *edited*, and throwing the edits away should leave `Thin Ice` on the screen,
 * not an empty room — otherwise the only way back to the shipped map is to remember
 * which one it was and find it in the dropdown again. A draft that started from nothing
 * has nothing behind it, so it goes back to the beginning.
 *
 * @param {string} id the id currently in the box
 * @param {readonly import('../levels.js').Stage[]} stages what is on disk
 * @returns {Draft}
 */
export function discardedDraft(id, stages) {
  const stage = stages.find((candidate) => candidate.id === id.trim());
  return stage ? formatDraft(stage) : freshDraft(stages);
}

/**
 * The stage as it would be written in `src/levels.js` — an object literal, indented
 * and quoted the way the stages already there are.
 *
 * @param {import('../levels.js').Stage} stage
 */
export function serializeStage(stage) {
  const lines = [
    `  id: ${quote(stage.id)},`,
    `  name: ${quote(stage.name)},`,
    `  hint: ${quote(stage.hint)},`,
    '  rows: [',
    ...stage.rows.map((row) => `    ${quote(row)},`),
    '  ],',
  ];

  if (stage.upper) {
    lines.push('  upper: [');
    for (const layer of stage.upper) {
      lines.push('    [');
      for (const row of layer) lines.push(`      ${quote(row)},`);
      lines.push('    ],');
    }
    lines.push('  ],');
  }

  if (stage.legend) {
    const entries = Object.entries(stage.legend).map(
      ([char, value]) =>
        `${quoteKey(char)}: ${typeof value === 'string' ? quote(value) : JSON.stringify(value)}`,
    );
    lines.push(`  legend: { ${entries.join(', ')} },`);
  }

  return `{\n${lines.join('\n')}\n}`;
}

/**
 * The name a stage is declared under in `src/levels.js`: the id, shouted.
 *
 * Every shipped stage already follows from its id this way, and that is worth more
 * than tidiness — it is what lets `./levels-source.js` find the declaration it is
 * replacing without having to understand the file it is in.
 *
 * @param {string} id
 */
export function constantFor(id) {
  return (id || 'new_stage').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/**
 * The whole thing, ready to paste: the type annotation and the `const` that every
 * stage in `src/levels.js` is declared with, around the literal.
 *
 * @param {import('../levels.js').Stage} stage
 */
export function stageSource(stage) {
  return `/** @type {Stage} */\nconst ${constantFor(stage.id)} = ${serializeStage(stage)};\n`;
}

/**
 * Splits the grid on its `---` lines.
 *
 * The one thing trimmed is a run of *empty* lines at the end of a layer, which is
 * the newline a textarea leaves behind and the blank line an author leaves before a
 * separator. A whitespace-only line is not empty — in an upper layer it is a row of
 * sky, and dropping it would slide the deck up the map.
 *
 * @param {string} grid
 * @returns {string[][]}
 */
function splitLayers(grid) {
  /** @type {string[][]} */
  const layers = [[]];
  for (const line of grid.split('\n')) {
    if (LAYER_BREAK.test(line)) layers.push([]);
    else layers[layers.length - 1].push(line);
  }
  for (const layer of layers) {
    while (layer.length > 0 && layer[layer.length - 1] === '') layer.pop();
  }
  return layers;
}

/**
 * Single quotes, unless the string holds one — the same choice `src/levels.js`
 * already makes, so a pasted row sits beside the existing ones without reformatting.
 * Backslashes go first: `\` is the chute.
 *
 * @param {string} text
 */
function quote(text) {
  const escaped = text.replace(/\\/g, '\\\\');
  if (!text.includes("'")) return `'${escaped}'`;
  if (!text.includes('"')) return `"${escaped}"`;
  return `'${escaped.replace(/'/g, "\\'")}'`;
}

/** A legend key needs quotes only when it is not a plain identifier. @param {string} char */
function quoteKey(char) {
  return /^[A-Za-z_$][\w$]*$/.test(char) ? char : quote(char);
}
