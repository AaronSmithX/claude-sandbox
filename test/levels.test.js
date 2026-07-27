import { describe, it, expect } from 'vitest';
import { STAGES } from '../src/levels.js';
import { checkStage } from '../src/level-checks.js';

/**
 * Every shipped stage, held to the checks in `src/level-checks.js`.
 *
 * The checks themselves live there rather than here because the level editor runs
 * the same ones while a map is being typed. What this file is for is running them
 * over the stage list in CI, one `it` per check so a failure names both the stage
 * and the question it failed.
 */

describe('the stage list', () => {
  it('has stages, each with a unique id', () => {
    expect(STAGES.length).toBeGreaterThan(0);
    const ids = STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every stage a name and a hint to show', () => {
    for (const stage of STAGES) {
      expect(stage.name, `${stage.id} needs a name`).toBeTruthy();
      expect(stage.hint, `${stage.id} needs a hint`).toBeTruthy();
    }
  });
});

for (const stage of STAGES) {
  describe(`stage: ${stage.name}`, () => {
    // The checks are run once, up front: a stage that does not parse yields the one
    // failure that says so rather than nine that all mean it.
    for (const check of checkStage(stage)) {
      it(check.label, () => {
        expect(check.problems.join('\n')).toBe('');
      });
    }
  });
}
