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
 *
 * This is the only file under `test/` that reads the game's levels, and the only one
 * that should: it is a lint over content, not a test of play. It asks whether a stage
 * loads, has one spawn, has a star, and can be walked to that star — never how. There
 * is no route in it to go stale, so redrawing a stage cannot break it; only breaking a
 * stage can. Everything that plays a level plays a copy, from `helpers/stages.js`.
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
      // A warning that has something to say is not a failure — the count it objects to
      // may be the point of the stage. It is skipped rather than passed, so the reason
      // is in the run and in the log instead of being swallowed by a green tick.
      if (check.severity === 'warning' && check.problems.length > 0) {
        const said = check.problems.join('; ');
        console.warn(`warning — ${stage.name}: ${check.label}: ${said}`);
        it.skip(`${check.label} (warning: ${said})`, () => {});
        continue;
      }
      it(check.label, () => {
        expect(check.problems.join('\n')).toBe('');
      });
    }
  });
}
