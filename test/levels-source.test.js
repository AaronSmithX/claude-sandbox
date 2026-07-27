import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { writeStage, LEVELS_FILE } from '../src/editor/levels-source.js';
import { serializeStage } from '../src/editor/draft.js';

/**
 * The level editor's Save button, which edits `src/levels.js` in place.
 *
 * This is the one thing either editor does that can damage the repository, so it gets
 * a file of its own. Two kinds of test are here and they are asking different things:
 *
 * - Over a **miniature file** that has the shape `src/levels.js` has, so a case can be
 *   set up in ten lines and the result read at a glance.
 * - Over **the real `src/levels.js`**, read off disk and never written back. Every rule
 *   in `levels-source.js` is a bet about how that file is laid out, and a bet like that
 *   is worth nothing unless something checks it against the file itself. If someone
 *   reformats the stage list, this is what says the Save button no longer works.
 */

/** A file with the shape the real one has: a prose comment, two stages, and the list. */
const FILE = `/**
 * The stages, in the order they are played.
 */

/**
 * Movement only.
 *
 * @type {Stage}
 */
const FIRST_STEPS = {
  id: 'first-steps',
  name: 'First Steps',
  hint: 'Reach the star.',
  rows: [
    '#####',
    '#@..#',
    '#..*#',
    '#####',
  ],
};

/**
 * Keys and doors.
 *
 * @type {Stage}
 */
const LOCK_AND_KEY = {
  id: 'lock-and-key',
  name: 'Lock and Key',
  hint: 'A key opens a door.',
  rows: [
    '#####',
    '#@g.#',
    '#G.*#',
    '#####',
  ],
};

/** Every stage, in play order. @type {Stage[]} */
export const STAGES = [
  FIRST_STEPS,
  LOCK_AND_KEY,
];

export const DEFAULT_MAP = LOCK_AND_KEY.rows;
`;

/**
 * A stage, with anything overridden. Deliberately not typed as `Partial<Stage>`: half
 * the tests below hand `writeStage` a field of the wrong type on purpose, which is the
 * case it exists to refuse.
 *
 * @param {Record<string, unknown>} over
 */
const stage = (over = {}) => ({
  id: 'first-steps',
  name: 'First Steps',
  hint: 'Reach the star.',
  rows: ['#####', '#@.*#', '#####'],
  ...over,
});

/**
 * The declarations a file holds, by constant name — read back the crude way, which is
 * the point: if a test can find `const X = {…};` by looking for those two lines, so can
 * the writer, and if it cannot then neither can the writer.
 *
 * @param {string} source
 */
function declarations(source) {
  /** @type {Record<string, string>} */
  const found = {};
  const lines = source.split('\n');
  lines.forEach((line, at) => {
    const match = /^const ([A-Z0-9_]+) = \{$/.exec(line);
    if (!match) return;
    const end = lines.indexOf('};', at);
    found[match[1]] = lines.slice(at, end + 1).join('\n');
  });
  return found;
}

/** The stage a declaration means. @param {string} text */
const valueOf = (text) => eval(`(${text.replace(/^const [A-Z0-9_]+ = /, '').replace(/;$/, '')})`);

/** What `export const STAGES = [...]` lists, in order. @param {string} source */
function listed(source) {
  const body = /export const STAGES = \[\n([\s\S]*?)\n\];/.exec(source);
  if (!body) throw new Error('no STAGES list');
  return body[1]
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter(Boolean);
}

describe('updating a stage that is already there', () => {
  it('replaces the declaration with the new one', () => {
    const edited = stage({ rows: ['######', '#@..*#', '######'] });
    const { text, action, constant } = writeStage(FILE, edited);

    expect(action).toBe('updated');
    expect(constant).toBe('FIRST_STEPS');
    expect(valueOf(declarations(text).FIRST_STEPS)).toEqual(edited);
  });

  it('leaves the paragraph above it alone', () => {
    // The prose is the part a person wrote, and the editor has no opinion about it.
    const { text } = writeStage(FILE, stage({ hint: 'Something else.' }));
    expect(text).toContain(' * Movement only.');
  });

  it('touches no other stage, and does not add to the list', () => {
    const { text } = writeStage(FILE, stage({ name: 'Renamed' }));
    expect(declarations(text).LOCK_AND_KEY).toBe(declarations(FILE).LOCK_AND_KEY);
    expect(listed(text)).toEqual(['FIRST_STEPS', 'LOCK_AND_KEY']);
  });

  it('carries the upper layers and the legend through', () => {
    const tall = stage({
      upper: [['     ', '  .  ', '     ']],
      legend: { k: 'key:rust', '~': { type: 'floor', level: 2 } },
    });
    const { text } = writeStage(FILE, tall);
    expect(valueOf(declarations(text).FIRST_STEPS)).toEqual(tall);
  });

  it('drops an upper layer the stage no longer has', () => {
    // A replacement is a replacement: saving a flattened stage over a two-layer one
    // must not leave the old deck behind.
    const { text } = writeStage(FILE, stage({ upper: [['     ', '  .  ', '     ']] }));
    const { text: flattened } = writeStage(text, stage());
    expect(valueOf(declarations(flattened).FIRST_STEPS).upper).toBeUndefined();
  });

  it('round-trips: saving twice changes the file only once', () => {
    const once = writeStage(FILE, stage()).text;
    expect(writeStage(once, stage()).text).toBe(once);
  });
});

describe('adding a stage that is not there yet', () => {
  const fresh = stage({ id: 'new-stage', name: 'New Stage' });

  it('declares it and puts it last in the list', () => {
    const { text, action, constant } = writeStage(FILE, fresh);

    expect(action).toBe('added');
    expect(constant).toBe('NEW_STAGE');
    expect(valueOf(declarations(text).NEW_STAGE)).toEqual(fresh);
    expect(listed(text)).toEqual(['FIRST_STEPS', 'LOCK_AND_KEY', 'NEW_STAGE']);
  });

  it('gives it the type annotation every other stage has', () => {
    expect(writeStage(FILE, fresh).text).toContain('/** @type {Stage} */\nconst NEW_STAGE = {');
  });

  it('lands after the last stage, not inside the sentence about the list', () => {
    const { text } = writeStage(FILE, fresh);
    expect(text).toContain(
      '};\n\n/** @type {Stage} */\nconst NEW_STAGE = {',
    );
    expect(text).toMatch(/const NEW_STAGE = \{[\s\S]*?\n};\n\n\/\*\* Every stage, in play order/);
  });

  it('is an update the second time, not a second copy', () => {
    const { text } = writeStage(FILE, fresh);
    const { text: again, action } = writeStage(text, { ...fresh, name: 'Renamed' });
    expect(action).toBe('updated');
    expect(listed(again)).toEqual(['FIRST_STEPS', 'LOCK_AND_KEY', 'NEW_STAGE']);
  });

  it('leaves the old one behind when the id changes, rather than guessing', () => {
    // Renaming the id is renaming the stage. The editor cannot tell that from authoring
    // a new one, so it does the safe thing and the author deletes what they meant to.
    const { text } = writeStage(FILE, stage({ id: 'first-paces' }));
    expect(listed(text)).toEqual(['FIRST_STEPS', 'LOCK_AND_KEY', 'FIRST_PACES']);
  });
});

describe('what it refuses', () => {
  /** @param {unknown} value */
  const refusal = (value) => {
    try {
      writeStage(FILE, value);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('it was accepted');
  };

  it.each(['../secret', 'a/b', 'First-Steps', 'has space', '', 'a.txt', '-leading'])(
    'refuses the id %o',
    (id) => {
      expect(refusal(stage({ id }))).toMatch(/is not an id a stage may have/);
    },
  );

  it('refuses an id that is not a string at all', () => {
    expect(refusal(stage({ id: null }))).toMatch(/is not an id a stage may have/);
    expect(refusal(null)).toMatch(/no stage to write/);
  });

  it('refuses an id that would collide with something that is not a stage', () => {
    // `STAGES` and `DEFAULT_MAP` are declared in that file too, and writing a stage
    // over either of them would break the game rather than save any work.
    expect(refusal(stage({ id: 'stages' }))).toMatch(/which src\/levels\.js already uses/);
    expect(refusal(stage({ id: 'default-map' }))).toMatch(/which src\/levels\.js already uses/);
  });

  it('refuses a row with a newline in it, which would end the string it sits in', () => {
    expect(refusal(stage({ rows: ['#####', '#@\n.*#'] }))).toBe('the grid row 2 runs onto a second line');
  });

  it('refuses a grid with no rows', () => {
    expect(refusal(stage({ rows: [] }))).toBe('the grid has no rows');
    expect(refusal(stage({ rows: 'not a list' }))).toBe('the grid has no rows');
  });

  it('names the storey a bad upper row is on, counting the ground as one', () => {
    expect(refusal(stage({ upper: [['ok'], ['fine', 'br\noken']] }))).toBe(
      'layer 3 row 2 runs onto a second line',
    );
  });

  it('refuses a name or hint that is not one line of text', () => {
    expect(refusal(stage({ name: 42 }))).toBe('the name is not text');
    expect(refusal(stage({ hint: 'two\nlines' }))).toBe('the hint runs onto a second line');
  });

  it('refuses a legend binding that would break out of its quotes', () => {
    expect(refusal(stage({ legend: { k: 'key\n:rust' } }))).toMatch(/the binding for "k"/);
    expect(refusal(stage({ legend: ['k', 'key:rust'] }))).toBe('the legend is not a set of bindings');
  });

  it('writes nothing it was not given, however the stage arrived', () => {
    const { text } = writeStage(FILE, { ...stage(), sneaky: 'get: () => {}' });
    expect(text).not.toContain('sneaky');
  });

  it('says so rather than mangling a file it does not recognise', () => {
    expect(() => writeStage('const NOTHING = 1;\n', stage({ id: 'new-stage' }))).toThrow(
      /no STAGES list/,
    );
    expect(() => writeStage('const FIRST_STEPS = {\n  id: 1,\n', stage())).toThrow(/never closes/);
  });
});

describe('the real src/levels.js', () => {
  const source = readFileSync(new URL(`../${LEVELS_FILE}`, import.meta.url), 'utf8');

  it('is laid out the way the writer assumes', () => {
    // Not a style rule for its own sake. Every one of these is something Save looks for
    // by hand, and a reformat that breaks one breaks the button silently.
    expect(source).toMatch(/^export const STAGES = \[$/m);
    expect(source).toMatch(/^\];$/m);
    for (const constant of listed(source)) {
      expect(source, `${constant} is not declared the way Save expects`).toContain(
        `\nconst ${constant} = {\n`,
      );
    }
  });

  it('declares every listed stage, and lists every declared one', () => {
    expect(Object.keys(declarations(source)).sort()).toEqual([...listed(source)].sort());
  });

  it('rewrites a shipped stage into the same stage, and nothing else into anything', () => {
    // Saving an untouched stage is a normal thing to do by accident, and what it must
    // not do is change the game. It may reformat the declaration it lands on — some
    // stages are hand-quoted differently from what `serializeStage` emits, and Save
    // normalises them — so the check is that the stage still *means* the same, while
    // every other stage and the list itself are byte-for-byte what they were.
    for (const [constant, declaration] of Object.entries(declarations(source))) {
      const shipped = valueOf(declaration);
      const { text, action } = writeStage(source, shipped);

      expect(action, `${constant} was not found in the file`).toBe('updated');
      expect(valueOf(declarations(text)[constant]), `${constant} changed meaning`).toEqual(shipped);
      expect(listed(text)).toEqual(listed(source));
      for (const [other, was] of Object.entries(declarations(source))) {
        if (other !== constant) expect(declarations(text)[other]).toBe(was);
      }
    }
  });

  it('re-quotes and re-indents, but only the stage it was asked to save', () => {
    // Some shipped stages are hand-formatted — `FIRST_STEPS` double-quotes rows that
    // need no quoting, and every `upper` in the file is packed onto one long line. Save
    // normalises whichever stage it lands on to `serializeStage`'s layout, which is
    // worth knowing about because it shows up in the diff. What it must never do is
    // normalise one it was not given.
    const before = declarations(source);
    const { text } = writeStage(source, valueOf(before.OVER_AND_UNDER));
    const after = declarations(text);

    expect(after.OVER_AND_UNDER).not.toBe(before.OVER_AND_UNDER);
    expect(after.OVER_AND_UNDER).toBe(
      `const OVER_AND_UNDER = ${serializeStage(valueOf(before.OVER_AND_UNDER))};`,
    );
    expect(after.FIRST_STEPS).toBe(before.FIRST_STEPS);
  });

  it('takes a new stage without disturbing a line of what is there', () => {
    const { text, action } = writeStage(source, stage({ id: 'scratch', name: 'Scratch' }));
    expect(action).toBe('added');
    expect(listed(text)).toEqual([...listed(source), 'SCRATCH']);
    // Everything up to the new declaration is byte-for-byte what it was.
    const untouched = text.slice(0, text.indexOf('/** @type {Stage} */\nconst SCRATCH'));
    expect(source.startsWith(untouched)).toBe(true);
  });
});
