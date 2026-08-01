import { describe, it, expect } from 'vitest';
import { FIXTURES } from './helpers/stages.js';
import {
  parseDraft,
  formatDraft,
  serializeStage,
  stageSource,
  discardedDraft,
  freshDraft,
  constantFor,
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

  it('leaves an upper layer exactly as typed, sky and all', () => {
    // No padding here: `TileMap` treats a short row on an upper layer as sky, and
    // padding would only stop a stage coming back out of the editor as it went in.
    const { stage } = parseDraft(draft('######\n#@..*#\n######\n---\n\n  ..'));
    expect(stage.upper).toEqual([['', '  ..']]);
  });

  it('keeps a blank line inside an upper layer, because it is a row of sky', () => {
    // Dropping it would slide the deck one row up the map.
    const { stage } = parseDraft(draft('#####\n#@.*#\n#####\n---\n\n\n ..  '));
    expect(stage.upper).toEqual([['', '', ' ..  ']]);
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
  // Real maps rather than four-character ones, since what breaks a round trip is the
  // awkward character in the middle of a real row: a chute's backslash, or a run of
  // spaces on an upper layer that has to survive being trimmed.
  for (const fixture of FIXTURES) {
    it(`survives ${fixture.name} going out to text and back`, () => {
      expect(parseDraft(formatDraft(fixture)).stage).toEqual(fixture);
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
    for (const fixture of FIXTURES) {
      expect(eval(`(${serializeStage(fixture)})`)).toEqual(fixture);
    }
  });

  it('quotes a row holding an apostrophe with double quotes, as levels.js does', () => {
    // No dialect character is an apostrophe any more, but a stage may still bind one
    // in its legend — and the serializer has to be able to write the row out either way.
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

describe('starting a new stage', () => {
  const named = (...ids) => ids.map((id) => ({ id, name: id, hint: '', rows: ['#@*#'] }));

  it('is the opening draft when nothing on disk is using its id', () => {
    expect(freshDraft(FIXTURES)).toBe(STARTER_DRAFT);
    expect(freshDraft([])).toBe(STARTER_DRAFT);
  });

  it('is a level that already works, so the editor does not open on red', () => {
    const { stage, problems } = parseDraft(freshDraft([]));
    expect(problems).toEqual([]);
    expect(checkStage(stage).filter((c) => c.problems.length > 0)).toEqual([]);
  });

  it('steps the id aside once a stage has been saved under it', () => {
    // Save tells "replace this stage" from "add one" by the id alone, so handing out
    // `new-stage` twice would mean the second level quietly overwrote the first.
    const next = freshDraft(named('new-stage'));
    expect(next.id).toBe('new-stage-2');
    expect(next.name).toBe('New Stage 2');
  });

  it('keeps stepping aside, however many have been saved', () => {
    expect(freshDraft(named('new-stage', 'new-stage-2')).id).toBe('new-stage-3');
    expect(freshDraft(named('new-stage', 'new-stage-2', 'new-stage-3')).id).toBe('new-stage-4');
  });

  it('fills the gap rather than counting past it', () => {
    expect(freshDraft(named('new-stage', 'new-stage-3')).id).toBe('new-stage-2');
  });

  it('always names an id a stage may be saved under', () => {
    // The id becomes a JavaScript identifier, and `levels-source.js` refuses anything
    // that is not lower case, digits and dashes. A generated one must not be refused.
    for (let taken = 0; taken < 12; taken++) {
      const ids = Array.from({ length: taken }, (_, i) => (i ? `new-stage-${i + 1}` : 'new-stage'));
      expect(freshDraft(named(...ids)).id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});

describe('discarding', () => {
  it('goes back to the stage on disk when the draft is an edit of one', () => {
    const [shipped] = FIXTURES;
    expect(discardedDraft(shipped.id, FIXTURES)).toEqual(formatDraft(shipped));
  });

  it('ignores space either side of the id, which a field collects easily', () => {
    expect(discardedDraft(`  ${FIXTURES[0].id} `, FIXTURES)).toEqual(formatDraft(FIXTURES[0]));
  });

  it('goes back to a blank stage when the id is not one on disk', () => {
    // A stage being authored has nothing behind it to restore, so Discard means the
    // beginning rather than someone else's map.
    expect(discardedDraft('never-shipped', FIXTURES)).toBe(STARTER_DRAFT);
    expect(discardedDraft('', FIXTURES)).toBe(STARTER_DRAFT);
  });

  it('does not hand back an id another stage is already using', () => {
    const saved = [...FIXTURES, { id: 'new-stage', name: 'N', hint: '', rows: ['#@*#'] }];
    expect(discardedDraft('never-shipped', saved).id).toBe('new-stage-2');
  });
});

describe('the name a stage is declared under', () => {
  it('is the id, shouted — which is how every shipped stage is already written', () => {
    expect(constantFor('first-steps')).toBe('FIRST_STEPS');
    expect(constantFor('two-places')).toBe('TWO_PLACES');
  });

  it('falls back to a name rather than nothing when there is no id yet', () => {
    expect(constantFor('')).toBe('NEW_STAGE');
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

  it('reports a tile hidden under another one at the same height', () => {
    // The star is drawn on the deck, over ground already at the deck's height. Both
    // are level 1, so a step lands on the floor and the star is never touched — the
    // map reads perfectly and the stage cannot be finished.
    // Two tiles can only share a height now if a stage says so itself: `floor:N` has
    // no character in the dialect, so `R` is bound to one here. That is exactly the
    // mistake worth catching — the map reads perfectly and the stage cannot be won.
    const stacked = {
      id: 'x',
      name: 'X',
      hint: 'H',
      legend: { R: 'floor:1' },
      rows: ['#####', '#@/R#', '#####'],
      upper: [['', '   *']],
    };
    const problems = checkStage(stacked)
      .filter((c) => c.problems.length > 0)
      .flatMap((c) => c.problems);
    expect(problems).toContain(
      'the cell at 3,1 holds a floor and a star at the same height — ' +
        'a step can only land on one of them',
    );
  });

  it('reports a gate with no plate to hold it', () => {
    const problems = failing(['#####', '#@.*#', '#P###', '#...#', '#####']).flatMap(
      (c) => c.problems,
    );
    expect(problems).toContain('the red gate at 1,2 has no plate to hold it');
  });
});
