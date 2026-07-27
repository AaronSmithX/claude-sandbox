import { describe, it, expect } from 'vitest';
import { parseScore, noteToFreq } from '../src/audio/score.js';
import { SCORE_SOURCES } from '../src/audio/index.js';

/** A one-track score at 120bpm, where a quarter note is exactly half a second. */
const score = (body) => parseScore(`tempo 120\ntrack t\n  voice sine\n${body}`);
const notesOf = (text) => score(text).tracks[0].notes;

describe('noteToFreq', () => {
  it('puts a4 at 440Hz', () => {
    expect(noteToFreq('a', '', 4)).toBeCloseTo(440);
  });

  it('doubles an octave up', () => {
    expect(noteToFreq('a', '', 5)).toBeCloseTo(880);
  });

  it('reads sharps and flats', () => {
    expect(noteToFreq('a', '#', 4)).toBeCloseTo(noteToFreq('b', 'b', 4));
    expect(noteToFreq('c', '', 4)).toBeCloseTo(261.626, 2);
  });

  it('rejects a letter that is not a note', () => {
    expect(() => noteToFreq('h', '', 4)).toThrow(/Unknown note/);
  });
});

describe('parseScore', () => {
  it('reads tempo and loop', () => {
    const parsed = parseScore('tempo 96\nloop on\ntrack t\n  c/4');
    expect(parsed.tempo).toBe(96);
    expect(parsed.loop).toBe(true);
  });

  it('defaults to a one-shot', () => {
    expect(score('c/4').loop).toBe(false);
  });

  it('turns note values into seconds', () => {
    const [quarter, eighth, whole] = notesOf('c/4 c/8 c/1');
    expect(quarter.dur).toBeCloseTo(0.5);
    expect(eighth.dur).toBeCloseTo(0.25);
    expect(whole.dur).toBeCloseTo(2);
  });

  it('lays notes end to end', () => {
    const [first, second, third] = notesOf('c/4 d/4 e/8');
    expect(first.time).toBeCloseTo(0);
    expect(second.time).toBeCloseTo(0.5);
    expect(third.time).toBeCloseTo(1);
  });

  it('makes a dotted note half again as long', () => {
    expect(notesOf('c/4.')[0].dur).toBeCloseTo(0.75);
  });

  it('reuses the last duration when one is left off', () => {
    const [, second] = notesOf('c/8 d');
    expect(second.dur).toBeCloseTo(0.25);
  });

  it('gives a rest no pitch, but still takes up time', () => {
    const [rest, after] = notesOf('-/4 c/4');
    expect(rest.freq).toBeNull();
    expect(after.time).toBeCloseTo(0.5);
  });

  it('lengthens the previous note with a tie, without adding another', () => {
    const notes = notesOf('c/4 ~/4 d/4');
    expect(notes).toHaveLength(2);
    expect(notes[0].dur).toBeCloseTo(1);
    expect(notes[1].time).toBeCloseTo(1);
  });

  it('takes the octave from the track unless the note says otherwise', () => {
    const parsed = parseScore('tempo 120\ntrack t\n  voice sine\n  octave 5\n  a a4');
    const [high, low] = parsed.tracks[0].notes;
    expect(high.freq).toBeCloseTo(880);
    expect(low.freq).toBeCloseTo(440);
  });

  it('ignores bar lines and comments', () => {
    const notes = notesOf('| c/4 | # a trailing comment\n  d/4');
    expect(notes).toHaveLength(2);
  });

  it('keeps tracks separate, each starting at zero', () => {
    const parsed = parseScore('tempo 120\ntrack a\n  c/4\ntrack b\n  e/4');
    expect(parsed.tracks.map((t) => t.name)).toEqual(['a', 'b']);
    expect(parsed.tracks[1].notes[0].time).toBeCloseTo(0);
  });

  it('reports the score length as the longest track', () => {
    const parsed = parseScore('tempo 120\ntrack a\n  c/1\ntrack b\n  e/4');
    expect(parsed.duration).toBeCloseTo(2);
  });
});

describe('parseScore errors', () => {
  const at = (line) => new RegExp(`line ${line}`);

  it('names the line of an unreadable token', () => {
    expect(() => parseScore('tempo 120\ntrack t\n  c/4\n  q/4')).toThrow(at(4));
  });

  it('rejects an unknown voice', () => {
    expect(() => parseScore('track t\n  voice kazoo\n  c/4')).toThrow(/unknown voice/);
  });

  it('rejects an odd note length', () => {
    expect(() => parseScore('track t\n  c/7')).toThrow(/odd note length/);
  });

  it('rejects a bad tempo', () => {
    expect(() => parseScore('tempo fast\ntrack t\n  c/4')).toThrow(/tempo/);
  });

  it('rejects notes with no track to put them on', () => {
    expect(() => parseScore('tempo 120\n  c/4')).toThrow(/expected a directive/);
  });

  it('rejects a tie with nothing to tie to', () => {
    expect(() => parseScore('track t\n  ~/4')).toThrow(/tie needs a note/);
  });

  it('rejects a noise hit on a pitched voice', () => {
    expect(() => parseScore('track t\n  voice sine\n  x/8')).toThrow(/voice noise/);
  });

  it('rejects a score with no tracks', () => {
    expect(() => parseScore('tempo 120\nloop on')).toThrow(/no tracks/);
  });
});

describe('the scores that ship with the game', () => {
  it.each(Object.keys(SCORE_SOURCES))('%s parses and has something in it', (name) => {
    const parsed = parseScore(SCORE_SOURCES[name]);
    expect(parsed.duration).toBeGreaterThan(0);
    expect(parsed.tracks.length).toBeGreaterThan(0);
    for (const track of parsed.tracks) {
      expect(track.notes.length).toBeGreaterThan(0);
      expect(track.gain).toBeLessThanOrEqual(0.3); // nothing should be shouting
    }
  });

  it('gives every track in the looping scores the same length, so the loop is seamless', () => {
    for (const name of ['theme', 'ambience']) {
      const parsed = parseScore(SCORE_SOURCES[name]);
      expect(parsed.loop).toBe(true);
      for (const track of parsed.tracks) {
        const end = track.notes.at(-1).time + track.notes.at(-1).dur;
        expect(end).toBeCloseTo(parsed.duration, 5);
      }
    }
  });
});
