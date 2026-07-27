import { describe, it, expect } from 'vitest';
import { STAGES } from '../src/levels.js';
import {
  parseDraft,
  formatDraft,
  serializeStage,
  stageSource,
  STARTER_DRAFT,
} from '../src/editor/draft.js';
import { checkStage } from '../src/level-checks.js';

/**
 * The editor's text format. These are the rules an author feels every time they type
 * a row, so they are worth pinning down: what a `---` does, what a space means on an
 * upper layer, and what comes out of the copy button.
 */

/** The four short fields, so a test can say only what it is about. */
const draft = (grid, legend = '') => ({ id: 'x', name: 'X', hint: 'H', grid, legend });

describe('parsing a draft', () => {
  it('takes a single block of text as the ground layer, with no upper', () => {
    const { stage, problems } = parseDraft(draft('#####\n#@..#\n#####'));
    expect(problems).toEqual([]);
    expect(stage.rows).toEqual(['#####', '#@..#', '#####']);
    expect(stage.upper).toBeUndefined();
    expect(stage.legend).toBeUndefined();
  });

  it('splits on a line of dashes, ground first', () => {
    const { stage } = parseDraft(draft('#####\n#@.*#\n#####\n---\n     \n  .  \n     '));
    expect(stage.rows).toEqual(['#####', '#@.*#', '#####']);
    expect(stage.upper).toEqual([['     ', '  .  ', '     ']]);
  });

  it('keeps the trailing newline a textarea leaves out of the row count', () => {
    const { stage } = parseDraft(draft('#####\n#@..#\n#####\n'));
    expect(stage.rows).toHaveLength(3);
  });

  it('leaves a short ground row short, for the parser to complain about', () => {
    // Padding it would hide the mistake; every cell of the ground is something.
    const { stage } = parseDraft(draft('#####\n#@.#\n#####'));
    expect(stage.rows[1]).toBe('#@.#');
  });

  it('pads an upper layer out to the ground, so only the deck has to be typed', () => {
    const { stage } = parseDraft(draft('######\n#@..*#\n######\n---\n\n  ..'));
    expect(stage.upper).toEqual([['      ', '  ..  ', '      ']]);
  });

  it('keeps a blank line inside an upper layer, because it is a row of sky', () => {
    // Dropping it would slide the deck one row up the map.
    const { stage } = parseDraft(draft('#####\n#@.*#\n#####\n---\n\n\n ..  '));
    expect(stage.upper).toEqual([['     ', '     ', ' ..  ']]);
  });

  it('says so when there is no grid at all', () => {
    const { problems } = parseDraft(draft('\n\n'));
    expect(problems).toEqual(['The grid is empty: a stage needs a row of tiles.']);
  });
});

describe('parsing a legend', () => {
  it('binds one character per line', () => {
    const { stage, problems } = parseDraft(draft('#@*#', 'k = key:rust\nK = door:rust'));
    expect(problems).toEqual([]);
    expect(stage.legend).toEqual({ k: 'key:rust', K: 'door:rust' });
  });

  it('binds characters that are punctuation, including = itself', () => {
    const { stage } = parseDraft(draft('#@*#', '# = floor\n= = wall'));
    expect(stage.legend).toEqual({ '#': 'floor', '=': 'wall' });
  });

  it('ignores blank lines and // comments', () => {
    const { stage, problems } = parseDraft(draft('#@*#', '// the rust set\n\nk = key:rust'));
    expect(problems).toEqual([]);
    expect(stage.legend).toEqual({ k: 'key:rust' });
  });

  it('takes a whole tile definition as JSON', () => {
    const { stage } = parseDraft(draft('#@*#', 'k = {"type":"floor","level":4}'));
    expect(stage.legend).toEqual({ k: { type: 'floor', level: 4 } });
  });

  it('reports a line that is not a binding, and keeps the rest', () => {
    const { stage, problems } = parseDraft(draft('#@*#', 'k = key:rust\nnonsense'));
    expect(problems).toEqual(['Legend line 2 is not a binding: "nonsense"']);
    expect(stage.legend).toEqual({ k: 'key:rust' });
  });
});

describe('round-tripping', () => {
  for (const stage of STAGES) {
    it(`survives ${stage.name} going out to text and back`, () => {
      expect(parseDraft(formatDraft(stage)).stage).toEqual(stage);
    });
  }

  it('survives a stage with a legend', () => {
    const stage = {
      id: 'rusty',
      name: 'Rusty',
      hint: 'A <b>rust</b> key.',
      rows: ['####', '#@k#', '####'],
      legend: { k: 'key:rust' },
    };
    expect(parseDraft(formatDraft(stage)).stage).toEqual(stage);
  });
});

describe('serializing a stage', () => {
  it('reads back as the stage it came from', () => {
    for (const stage of STAGES) {
      expect(eval(`(${serializeStage(stage)})`)).toEqual(stage);
    }
  });

  it('quotes a row holding an apostrophe with double quotes, as levels.js does', () => {
    const stage = { id: 'a', name: 'A', hint: 'H', rows: ["#./'~'/.#"] };
    expect(serializeStage(stage)).toContain(`"#./'~'/.#"`);
  });

  it('escapes the chute, which is a backslash', () => {
    const stage = { id: 'a', name: 'A', hint: 'H', rows: ['#\\.#'] };
    expect(serializeStage(stage)).toContain("'#\\\\.#'");
    expect(eval(`(${serializeStage(stage)})`).rows).toEqual(['#\\.#']);
  });

  it('wraps the literal in the declaration levels.js uses', () => {
    const stage = { id: 'first-steps', name: 'First Steps', hint: 'H', rows: ['#@*#'] };
    expect(stageSource(stage)).toMatch(/^\/\*\* @type \{Stage\} \*\/\nconst FIRST_STEPS = \{/);
    expect(stageSource(stage).trimEnd()).toMatch(/\};$/);
  });
});

describe('the checks the editor shows', () => {
  const stage = (rows) => ({ id: 'x', name: 'X', hint: 'H', rows });
  const failing = (rows) => checkStage(stage(rows)).filter((c) => c.problems.length > 0);

  it('passes a level that works', () => {
    expect(failing(['#####', '#@..#', '#..*#', '#####'])).toEqual([]);
  });

  it('passes the level a first visit opens with', () => {
    // An editor that greeted you with a page of red would be a poor start.
    const { stage, problems } = parseDraft(STARTER_DRAFT);
    expect(problems).toEqual([]);
    expect(checkStage(stage).filter((c) => c.problems.length > 0)).toEqual([]);
  });

  it('reports the parse error, and nothing after it, for a map that will not parse', () => {
    // Nine failures all caused by one bad character says less than the one error.
    expect(failing(['#####', '#@.#', '#####'])).toEqual([
      { label: 'parses', problems: ['Map row 1 is 4 characters, expected 5'] },
    ]);
  });

  it('reports a star that cannot be walked to', () => {
    expect(failing(['#####', '#@..#', '#####', '#*..#', '#####'])).toEqual([
      {
        label: 'can be walked from the spawn to the star',
        problems: ['the star at 1,3 is walled off from the spawn'],
      },
    ]);
  });

  it('reports a gate with no plate to hold it', () => {
    const problems = failing(['#####', '#@.*#', '#P###', '#...#', '#####']).flatMap(
      (c) => c.problems,
    );
    expect(problems).toContain('the red gate at 1,2 has no plate to hold it');
  });
});
