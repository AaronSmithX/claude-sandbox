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

  it('tells a noise hit from a rest, which share having no pitch', () => {
    // The synth decides what to sound from this. While both arrived as a bare null,
    // a drum track's rests were played as beats and every pattern came out straight.
    const [rest, hit] = parseScore('track t\n  voice noise\n  -/8 x/8').tracks[0].notes;
    expect(rest.hit).toBe(false);
    expect(hit.hit).toBe(true);
    expect(hit.freq).toBeNull();
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

  it('strikes the notes of a chord together', () => {
    const notes = notesOf('[c e g]/2');
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.time)).toEqual([0, 0, 0]);
    expect(notes.map((n) => n.dur)).toEqual([1, 1, 1]);
    expect(notes.map((n) => n.freq)).toEqual([
      noteToFreq('c', '', 4),
      noteToFreq('e', '', 4),
      noteToFreq('g', '', 4),
    ]);
  });

  it('gives a chord the time of one note, not one per voice', () => {
    const [, , , after] = notesOf('[c e g]/4 d/4');
    expect(after.time).toBeCloseTo(0.5);
  });

  it('lets a voice of a chord name its own octave', () => {
    const [low, high] = notesOf('[c c5]/4'); // the track's own octave is 4
    expect(high.freq).toBeCloseTo(low.freq * 2);
  });

  it('reuses the last duration for a chord written without one', () => {
    const [, chord] = notesOf('c/8 [c e]');
    expect(chord.dur).toBeCloseTo(0.25);
  });

  it('lengthens every voice of a chord with a tie', () => {
    const notes = notesOf('[c e g]/4 ~/4');
    expect(notes).toHaveLength(3);
    for (const note of notes) expect(note.dur).toBeCloseTo(1);
  });

  it('keeps tying to the same chord, so two ties make one long note', () => {
    const notes = notesOf('c/4 ~/4 ~/4');
    expect(notes).toHaveLength(1);
    expect(notes[0].dur).toBeCloseTo(1.5);
  });

  it('ignores bar lines and comments', () => {
    const notes = notesOf('| c/4 | # a trailing comment\n  d/4');
    expect(notes).toHaveLength(2);
  });

  it('reads a sharp as a sharp, not as the start of a comment', () => {
    // `#` is both the sharp sign and the comment marker. Stripping from the first one
    // anywhere on the line left `f` behind and swallowed everything after it.
    const notes = notesOf('f#/4 g/4');
    expect(notes).toHaveLength(2);
    expect(notes[0].freq).toBeCloseTo(noteToFreq('f', '#', 4));
  });

  it('still takes a comment after a note', () => {
    expect(notesOf('c#5/4 # and a word about it')).toHaveLength(1);
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

  it('rejects a chord that is never closed', () => {
    expect(() => parseScore('track t\n  [c e g/2')).toThrow(/closing/);
  });

  it('rejects an empty chord', () => {
    expect(() => parseScore('track t\n  []/2')).toThrow(/empty chord/);
  });

  it.each(['-', '~', 'x'])('rejects "%s" inside a chord', (pitch) => {
    expect(() => parseScore(`track t\n  [c ${pitch} g]/2`)).toThrow(/inside a chord/);
  });

  it('names the line of a bad pitch inside a chord', () => {
    expect(() => parseScore('tempo 120\ntrack t\n  c/4\n  [c q g]/2')).toThrow(at(4));
  });
});

describe('the scores that ship with the game', () => {
  // Anything beyond parsing — seamless loops, gains, register — is `checkScore`, and
  // is swept over the same scores in test/score-checks.test.js.
  it.each(Object.keys(SCORE_SOURCES))('%s parses and has something in it', (name) => {
    const parsed = parseScore(SCORE_SOURCES[name]);
    expect(parsed.duration).toBeGreaterThan(0);
    expect(parsed.tracks.length).toBeGreaterThan(0);
    for (const track of parsed.tracks) {
      expect(track.notes.length).toBeGreaterThan(0);
    }
  });
});
