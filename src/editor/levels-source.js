/**
 * Putting a stage back into `src/levels.js`, and refusing everything else.
 *
 * The music editor has the easy version of this problem: a score is a whole file, so
 * Save is `writeFile` and the only question is the name — which is all
 * `../audio-editor/save-path.js` has to answer. A stage is not a file. `src/levels.js`
 * holds every stage, in play order, each under a paragraph about what it teaches. Save
 * therefore has to *edit* that file rather than replace it, and this is what decides
 * how.
 *
 * The rule is deliberately dull. A stage is the run of lines from `const NAME = {` down
 * to the next line that is exactly `};`, and only those lines are replaced. Everything
 * above them — the `@type`, the paragraph — stays where it is, because that is the part
 * a person wrote and the editor has no opinion about. This works because the file is
 * already in the shape `serializeStage` emits, and it would stop working if someone
 * reformatted `src/levels.js` by hand; the test that runs this against the real file is
 * there to say so if they do.
 *
 * Within the lines it does replace, the layout is `serializeStage`'s and not whatever
 * was there. A few shipped stages are hand-formatted — rows double-quoted that need no
 * quoting, an `upper` packed onto one line — and saving one of those normalises it. That
 * is a diff to expect, not a bug; the stage means the same either way, and the stages
 * that were not saved are not touched.
 *
 * No `node:fs` and no `node:path`, for the reason `../audio-editor/save-path.js` gives:
 * everything under `src/` is browser code. This takes the file's text and gives back the
 * text it should become. The Vite plugin does the reading and the writing.
 */

import { serializeStage, stageSource, constantFor } from './draft.js';

/** Relative to the repository root. The only file this can write. */
export const LEVELS_FILE = 'src/levels.js';

/**
 * The shape every shipped id already has, and the shape that survives being shouted
 * into a JavaScript identifier. It admits no dot, no slash and no space, so nothing
 * arriving here can name a file or close a string.
 */
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Names `src/levels.js` declares for something that is not a stage. */
const RESERVED = new Set(['STAGES', 'DEFAULT_MAP']);

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {string} the same text, once it is known to be one line of it
 */
function line(value, what) {
  if (typeof value !== 'string') throw new Error(`${what} is not text`);
  // A newline would end the string literal this is about to sit inside, and no field
  // the editor reads can contain one — the grid box is split on them before it gets
  // here. So this only ever fires on something that did not come from the editor.
  if (/[\n\r]/.test(value)) throw new Error(`${what} runs onto a second line`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {string[]}
 */
function grid(value, what) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${what} has no rows`);
  return value.map((row, index) => line(row, `${what} row ${index + 1}`));
}

/**
 * The stage, once it is known to be one.
 *
 * `serializeStage` will happily turn anything into something that looks like source, so
 * the check has to happen before it rather than after. What comes back is a fresh object
 * built only from fields that passed, which is also what keeps a stray extra property
 * from being written into the file.
 *
 * @param {unknown} value
 * @returns {import('../levels.js').Stage}
 */
function checked(value) {
  if (!value || typeof value !== 'object') throw new Error('there is no stage to write');
  const { id, name, hint, rows, upper, legend } = /** @type {any} */ (value);

  if (typeof id !== 'string' || !SAFE_ID.test(id)) {
    throw new Error(`"${id}" is not an id a stage may have: lower case, digits and dashes`);
  }

  /** @type {import('../levels.js').Stage} */
  const stage = {
    id,
    name: line(name, 'the name'),
    hint: line(hint, 'the hint'),
    rows: grid(rows, 'the grid'),
  };

  if (upper !== undefined) {
    if (!Array.isArray(upper)) throw new Error('the upper layers are not a list');
    // Numbered from 2 because layer 1 is the ground, which is `rows` and is reported on
    // as "the grid" — an author counting storeys and an error message should agree.
    stage.upper = upper.map((layer, index) => grid(layer, `layer ${index + 2}`));
  }

  if (legend !== undefined) {
    if (!legend || typeof legend !== 'object' || Array.isArray(legend)) {
      throw new Error('the legend is not a set of bindings');
    }
    /** @type {import('../types.js').Legend} */
    const bindings = {};
    for (const [char, bound] of Object.entries(legend)) {
      line(char, 'a legend character');
      // A binding is either a tile's name or a whole tile as an object. The first is
      // quoted and the second is `JSON.stringify`d, so only the first can carry a
      // newline into the file.
      bindings[char] = typeof bound === 'string' ? line(bound, `the binding for "${char}"`) : bound;
    }
    stage.legend = bindings;
  }

  return stage;
}

/**
 * @typedef {object} Written
 * @property {string} text what `src/levels.js` should now contain
 * @property {'updated'|'added'} action whether the stage was already in the file
 * @property {string} constant the name it is declared under
 */

/**
 * @param {string} source the current text of `src/levels.js`
 * @param {unknown} value the stage to put into it
 * @returns {Written}
 * @throws {Error} with a sentence to show the author, if the stage is not one that can
 *   be written or the file is not one this knows how to edit
 */
export function writeStage(source, value) {
  const stage = checked(value);
  const constant = constantFor(stage.id);
  if (RESERVED.has(constant)) {
    throw new Error(`"${stage.id}" would be ${constant}, which ${LEVELS_FILE} already uses`);
  }

  const lines = source.split('\n');
  const literal = `const ${constant} = ${serializeStage(stage)};`;

  // Already there: swap the declaration out, leave whatever is written above it.
  const at = lines.indexOf(`const ${constant} = {`);
  if (at !== -1) {
    const end = lines.indexOf('};', at);
    if (end === -1) throw new Error(`${constant} in ${LEVELS_FILE} never closes`);
    lines.splice(at, end - at + 1, literal);
    return { text: lines.join('\n'), action: 'updated', constant };
  }

  // New: it has to go in the list as well, or it is a stage nothing plays.
  const listAt = lines.findIndex((text) => text.startsWith('export const STAGES = ['));
  if (listAt === -1) throw new Error(`${LEVELS_FILE} has no STAGES list to add to`);
  const listEnd = lines.indexOf('];', listAt);
  if (listEnd === -1) throw new Error(`the STAGES list in ${LEVELS_FILE} never closes`);
  // The list first: it is below the declaration, so splicing it now leaves the index the
  // declaration goes at untouched. The other order would not.
  lines.splice(listEnd, 0, `  ${constant},`);

  // Back up over the sentence that introduces the list, to the blank line above it, so
  // the new stage lands after the last one rather than between that sentence and what
  // it is describing.
  let declareAt = listAt;
  while (declareAt > 0 && lines[declareAt - 1].trim() !== '') declareAt--;
  lines.splice(declareAt, 0, stageSource(stage).trimEnd(), '');

  return { text: lines.join('\n'), action: 'added', constant };
}
