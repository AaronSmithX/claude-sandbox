import { describe, it, expect } from 'vitest';
import {
  parseDraft,
  offsetOf,
  discardedScore,
  STARTER_SCORE,
  STARTER_NAME,
} from '../src/audio-editor/draft.js';
import { SCORE_SOURCES } from '../src/audio/index.js';
import { scoreProblems } from '../src/audio/score-checks.js';
import { scorePathFor, SCORES_DIR } from '../src/audio-editor/save-path.js';

describe('parseDraft', () => {
  it('gives back the score when the text reads', () => {
    const { score, problems } = parseDraft('tempo 120\ntrack t\n  voice sine\n  c/4');
    expect(problems).toEqual([]);
    expect(score.tracks).toHaveLength(1);
  });

  it('reports a parse error rather than throwing it', () => {
    // The editor asks this on every keystroke, and half a word is not a reason for the
    // page to fall over.
    const { score, problems } = parseDraft('tempo 120\ntrack t\n  c/4\n  q/4');
    expect(score).toBeNull();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/line 4/);
  });

  it('says nothing is wrong only when nothing is', () => {
    const { score, problems } = parseDraft(STARTER_SCORE);
    expect(problems).toEqual([]);
    expect(score).not.toBeNull();
  });
});

describe('STARTER_SCORE', () => {
  // An editor that greets you with a page of red is a poor start — the same thing
  // test/editor-draft.test.js asks of the level editor's opening draft.
  it('passes every check the editor will show', () => {
    expect(scoreProblems(parseDraft(STARTER_SCORE).score)).toEqual([]);
  });

  it('demonstrates a chord, which is the reason to reach for this format', () => {
    expect(STARTER_SCORE).toMatch(/\[c e g\]/);
  });
});

describe('offsetOf', () => {
  const text = 'tempo 120\ntrack t\n  voice sine\n  c/4 d/4';

  it('finds the character a note was written at', () => {
    const { score } = parseDraft(text);
    const [first, second] = score.tracks[0].notes;
    expect(text.slice(offsetOf(text, first), offsetOf(text, first) + 3)).toBe('c/4');
    expect(text.slice(offsetOf(text, second), offsetOf(text, second) + 3)).toBe('d/4');
  });

  it('finds a note written after a comment on an earlier line', () => {
    const commented = '# a word first\ntrack t\n  voice sine\n  g/4';
    const { score } = parseDraft(commented);
    const note = score.tracks[0].notes[0];
    expect(commented.slice(offsetOf(commented, note), offsetOf(commented, note) + 3)).toBe('g/4');
  });

  it('finds a voice of a chord at the chord, since that is the token to edit', () => {
    const chord = 'track t\n  voice sine\n  [c e g]/2';
    const { score } = parseDraft(chord);
    for (const note of score.tracks[0].notes) {
      expect(chord.slice(offsetOf(chord, note), offsetOf(chord, note) + 8)).toBe('[c e g]/');
    }
  });

  it('clamps rather than throwing when the note is from older text', () => {
    // The roll is drawn from the last score that parsed, which can be behind what is
    // in the box — a click must not put the caret off the end of it.
    expect(offsetOf('short', { line: 99, col: 99 })).toBe(5);
  });
});

describe('discardedScore', () => {
  const sources = { theme: 'tempo 90\n', win: 'tempo 200\n' };

  it('goes back to the score on disk when the draft is an edit of one', () => {
    expect(discardedScore('theme', sources)).toEqual({ name: 'theme', text: 'tempo 90\n' });
  });

  it('ignores space either side of the name, which a field collects easily', () => {
    expect(discardedScore('  win ', sources)).toEqual({ name: 'win', text: 'tempo 200\n' });
  });

  it('goes back to the starting score when the name is not one on disk', () => {
    expect(discardedScore('sketch', sources)).toEqual({
      name: STARTER_NAME,
      text: STARTER_SCORE,
    });
  });

  it('is not fooled by a name that every object answers to', () => {
    // `sources['constructor']` is not undefined, and the name box is a place a person
    // can type that word.
    expect(discardedScore('constructor', sources).text).toBe(STARTER_SCORE);
    expect(discardedScore('__proto__', sources).text).toBe(STARTER_SCORE);
  });
});

describe('STARTER_NAME', () => {
  it('is a legal name to save under', () => {
    expect(scorePathFor(STARTER_NAME)).toBe(`${SCORES_DIR}/${STARTER_NAME}.txt`);
  });

  it('is not the name of a score the game plays', () => {
    // The editor opens on STARTER_SCORE under this name, and Save writes whatever the
    // name box says — so a default of `theme` would make a first, exploratory Save
    // replace the game's music with the demo.
    expect(Object.keys(SCORE_SOURCES)).not.toContain(STARTER_NAME);
  });
});

describe('scorePathFor', () => {
  it('accepts the names the shipped scores use', () => {
    expect(scorePathFor('theme')).toBe(`${SCORES_DIR}/theme.txt`);
    expect(scorePathFor('audio-editor-test')).toBe(`${SCORES_DIR}/audio-editor-test.txt`);
  });

  it.each(['../secret', 'a/b', '..', '.', 'Theme', 'has space', '', 'a.txt', '/etc/passwd'])(
    'refuses %o',
    (name) => {
      expect(scorePathFor(name)).toBeNull();
    },
  );

  it('refuses anything that is not a string', () => {
    expect(scorePathFor(null)).toBeNull();
    expect(scorePathFor(42)).toBeNull();
  });
});
