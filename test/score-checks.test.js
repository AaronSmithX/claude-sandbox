import { describe, it, expect } from 'vitest';
import { parseScore } from '../src/audio/score.js';
import { checkScore, scoreProblems } from '../src/audio/score-checks.js';
import { SCORE_SOURCES } from '../src/audio/index.js';

/**
 * Each case below is built from a defect that was really in `src/audio/scores/wip/`
 * before this check existed, which is why the checks are the ones they are.
 */
const check = (label, text) => {
  const found = checkScore(parseScore(text)).find((c) => c.label === label);
  if (!found) throw new Error(`no check labelled "${label}"`);
  return found.problems;
};

describe('loops without a seam', () => {
  const label = 'loops without a seam';

  it('passes when every track ends together', () => {
    expect(check(label, 'tempo 120\nloop on\ntrack a\n  c/1\ntrack b\n  e/2 g/2')).toEqual([]);
  });

  it('names a track that comes up short, and by how much', () => {
    // `solemn` was exactly this: four tracks of 16 beats against one of 17.
    const problems = check(label, 'tempo 120\nloop on\ntrack a\n  c/1\ntrack b\n  e/2');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"b"/);
    expect(problems[0]).toMatch(/2 beats short/);
  });

  it('is not even asked of a one-shot, which has no seam to mind', () => {
    const oneShot = parseScore('tempo 120\ntrack a\n  c/1\ntrack b\n  e/2');
    expect(checkScore(oneShot).map((c) => c.label)).not.toContain(label);
    expect(scoreProblems(oneShot)).toEqual([]);
  });
});

describe('fills whole bars', () => {
  const label = 'fills whole bars';

  it('passes a track that is a whole number of bars', () => {
    expect(check(label, 'tempo 120\nloop on\ntrack a\n  c/1 c/1')).toEqual([]);
  });

  it('catches bar lines that do not add up', () => {
    // `factory` wrote eight sixteenths between bar lines and called it a bar.
    const problems = check(label, 'tempo 120\nloop on\ntrack a\n  | c/16 c/16 c/16 c/16 |');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/0.25 bars/);
  });
});

describe('gain checks', () => {
  it('catches a single track that is shouting', () => {
    const problems = check(
      'keeps every track under its own ceiling',
      'track a\n  gain 0.5\n  c/4',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/0\.5/);
  });

  it('catches tracks that are each quiet but loud together', () => {
    const four = ['a', 'b', 'c', 'd'].map((n) => `track ${n}\n  gain 0.25\n  c/4`).join('\n');
    expect(check('leaves the master some headroom', four)).toHaveLength(1);
  });

  it('allows a mix that leaves headroom', () => {
    expect(check('leaves the master some headroom', 'track a\n  gain 0.3\n  c/4')).toEqual([]);
  });
});

describe('has something to say on every track', () => {
  const label = 'has something to say on every track';

  it('catches a track of nothing but rests', () => {
    expect(check(label, 'track a\n  c/4\ntrack b\n  -/4 -/4')).toEqual([
      '"b" is nothing but rests',
    ]);
  });

  it('counts a noise hit as something, even though it has no pitch', () => {
    expect(check(label, 'track a\n  voice noise\n  -/4 x/4')).toEqual([]);
  });
});

describe('stays out of the shrill register', () => {
  const label = 'stays out of the shrill register';

  it('catches a square lead up at c7', () => {
    // Every one of the five sketches had a square wave somewhere above 2kHz.
    const problems = check(label, 'track a\n  voice square\n  c7/4');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/2093Hz/);
  });

  it('leaves a sine alone up there, which is a sparkle rather than a whistle', () => {
    expect(check(label, 'track a\n  voice sine\n  c7/4')).toEqual([]);
  });

  it('allows a square up to g6', () => {
    expect(check(label, 'track a\n  voice square\n  g6/4')).toEqual([]);
  });
});

describe('the scores that ship with the game', () => {
  it.each(Object.keys(SCORE_SOURCES))('%s passes every check', (name) => {
    expect(scoreProblems(parseScore(SCORE_SOURCES[name]))).toEqual([]);
  });
});
