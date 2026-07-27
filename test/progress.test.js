import { describe, it, expect } from 'vitest';
import { Progress, STORAGE_KEY } from '../src/progress.js';

/**
 * A stand-in for localStorage: the same three methods, backed by a Map the test can
 * read. `fail` makes every call throw, which is what Safari's private mode does and
 * what a browser with cookies blocked does.
 */
function fakeStorage({ seed = null, fail = false } = {}) {
  const data = new Map(seed === null ? [] : [[STORAGE_KEY, seed]]);
  return {
    data,
    getItem(key) {
      if (fail) throw new Error('storage is unavailable');
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      if (fail) throw new Error('storage is unavailable');
      data.set(key, value);
    },
    removeItem(key) {
      if (fail) throw new Error('storage is unavailable');
      data.delete(key);
    },
  };
}

/** What the store actually wrote, parsed back. */
const saved = (storage) => JSON.parse(storage.data.get(STORAGE_KEY));

describe('Progress', () => {
  it('starts empty when nothing has been saved', () => {
    const progress = new Progress(fakeStorage());
    expect(progress.size).toBe(0);
    expect(progress.has('first-steps')).toBe(false);
  });

  it('remembers a cleared stage in the store', () => {
    const storage = fakeStorage();
    const progress = new Progress(storage);

    expect(progress.complete('first-steps')).toBe(true);
    expect(progress.has('first-steps')).toBe(true);
    expect(saved(storage)).toEqual(['first-steps']);
  });

  it('reads back what a previous visit wrote', () => {
    const storage = fakeStorage();
    new Progress(storage).complete('first-steps');

    const later = new Progress(storage);
    expect(later.has('first-steps')).toBe(true);
    expect(later.has('thin-ice')).toBe(false);
  });

  it('says whether a stage was already cleared, and writes it once', () => {
    const storage = fakeStorage();
    const progress = new Progress(storage);

    expect(progress.complete('first-steps')).toBe(true);
    expect(progress.complete('first-steps')).toBe(false);
    expect(saved(storage)).toEqual(['first-steps']);
  });

  it('hands out a copy, so the set cannot be edited behind its back', () => {
    const progress = new Progress(fakeStorage());
    progress.complete('first-steps');

    progress.completed.add('the-gauntlet');
    expect(progress.has('the-gauntlet')).toBe(false);
  });

  it('forgets everything, on disk as well as in memory', () => {
    const storage = fakeStorage();
    const progress = new Progress(storage);
    progress.complete('first-steps');

    progress.clear();
    expect(progress.size).toBe(0);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    expect(new Progress(storage).size).toBe(0);
  });

  it('ignores saved data it cannot read', () => {
    // Someone else's key, a half-written value, or ours from a shape we no longer
    // speak. None of it is progress, and none of it should stop the game loading.
    for (const junk of ['not json at all', '{"completed":1}', '"first-steps"', '42']) {
      expect(new Progress(fakeStorage({ seed: junk })).size).toBe(0);
    }
  });

  it('keeps only the ids out of a list with other things in it', () => {
    const seed = JSON.stringify(['first-steps', 7, null, { id: 'thin-ice' }, 'going-up']);
    const progress = new Progress(fakeStorage({ seed }));

    expect([...progress.completed]).toEqual(['first-steps', 'going-up']);
  });

  it('plays on when the store throws, remembering only this session', () => {
    const storage = fakeStorage({ fail: true });
    const progress = new Progress(storage);

    expect(progress.size).toBe(0);
    expect(() => progress.complete('first-steps')).not.toThrow();
    // Still true here — the run in front of the player is unaffected; it is only
    // tomorrow that will have forgotten.
    expect(progress.has('first-steps')).toBe(true);
    expect(() => progress.clear()).not.toThrow();
  });

  it('works with no store at all', () => {
    const progress = new Progress(null);
    expect(() => progress.complete('first-steps')).not.toThrow();
    expect(progress.has('first-steps')).toBe(true);
    expect(new Progress(null).size).toBe(0);
  });
});
