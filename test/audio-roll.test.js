import { describe, it, expect } from 'vitest';
import { parseScore } from '../src/audio/score.js';
import { layout, hitTest, freqToMidi, midiToName } from '../src/audio-editor/roll.js';

const SIZE = { width: 800, height: 400 };
const view = (text) => layout(parseScore(text), SIZE);

describe('freqToMidi and midiToName', () => {
  it('puts a4 at 69, which is where MIDI puts it', () => {
    expect(freqToMidi(440)).toBe(69);
    expect(midiToName(69)).toBe('A4');
  });

  it('names middle C', () => {
    expect(midiToName(60)).toBe('C4');
  });
});

describe('layout', () => {
  it('starts the score at the left edge and fills the width', () => {
    const roll = view('tempo 120\ntrack t\n  voice sine\n  c/4 d/4 e/4 f/4');
    expect(roll.blocks[0].x).toBe(0);
    // A pixel short of the edge: every block gives one back so neighbours do not touch.
    const last = roll.blocks.at(-1);
    expect(last.x + last.w).toBe(SIZE.width - 1);
  });

  it('puts a higher note higher up the picture', () => {
    const roll = view('tempo 120\ntrack t\n  voice sine\n  c/4 c6/4');
    const [low, high] = roll.blocks;
    expect(high.y).toBeLessThan(low.y);
  });

  it('gives the voices of a chord one x and different heights', () => {
    const roll = view('tempo 120\ntrack t\n  voice sine\n  [c e g]/2');
    expect(roll.blocks).toHaveLength(3);
    const xs = new Set(roll.blocks.map((b) => b.x));
    expect(xs.size).toBe(1);
    expect(new Set(roll.blocks.map((b) => b.y)).size).toBe(3);
  });

  it('draws nothing for a rest', () => {
    const roll = view('tempo 120\ntrack t\n  voice sine\n  c/4 -/4 d/4');
    expect(roll.blocks).toHaveLength(2);
  });

  it('draws a noise hit but not a noise rest', () => {
    // Both arrive with no pitch. Drawing the rests would show a drum track playing
    // flat out, which is exactly the bug this distinction was added to fix.
    const roll = view('tempo 120\ntrack t\n  voice noise\n  x/8 -/8 x/8 -/8');
    expect(roll.blocks).toHaveLength(2);
  });

  it('puts noise below the pitched notes rather than on the pitch axis', () => {
    const roll = view(
      'tempo 120\ntrack a\n  voice sine\n  c/1\ntrack b\n  voice noise\n  x/4 x/4 x/4 x/4',
    );
    const pitched = roll.blocks.filter((b) => b.track === 0);
    const noise = roll.blocks.filter((b) => b.track === 1);
    for (const block of noise) expect(block.y).toBeGreaterThanOrEqual(roll.pitchHeight);
    for (const block of pitched) expect(block.y).toBeLessThan(roll.pitchHeight);
  });

  it('marks a bar line every four beats and a beat line between', () => {
    const roll = view('tempo 120\ntrack t\n  voice sine\n  c/1 c/1');
    expect(roll.bars).toHaveLength(2); // two bars
    expect(roll.bars[0]).toBe(0);
    expect(roll.bars[1]).toBeCloseTo(SIZE.width / 2);
    expect(roll.beats).toHaveLength(6); // the other six of the eight beats
  });

  it('labels the Cs, so a pitch can be read off the picture', () => {
    const roll = view('tempo 120\ntrack t\n  voice sine\n  c/4 c6/4');
    expect(roll.guides.map((g) => g.label)).toContain('C4');
    expect(roll.guides.map((g) => g.label)).toContain('C6');
  });

  it('gives every track a colour and says which are pitched', () => {
    const roll = view('tempo 120\ntrack a\n  voice sine\n  c/4\ntrack b\n  voice noise\n  x/4');
    expect(roll.tracks.map((t) => t.name)).toEqual(['a', 'b']);
    expect(roll.tracks.map((t) => t.pitched)).toEqual([true, false]);
    expect(new Set(roll.tracks.map((t) => t.color)).size).toBe(2);
  });

  it('survives a score with nothing pitched in it at all', () => {
    const roll = view('tempo 120\ntrack t\n  voice noise\n  x/4 x/4');
    expect(roll.blocks).toHaveLength(2);
    expect(roll.pitchHeight).toBeGreaterThan(0);
  });

  it('keeps a note wide enough to see, however short', () => {
    const roll = view('tempo 120\ntrack t\n  voice sine\n  c/32 c/1 c/1 c/1 c/1');
    for (const block of roll.blocks) expect(block.w).toBeGreaterThanOrEqual(2);
  });
});

describe('hitTest', () => {
  const roll = view('tempo 120\ntrack t\n  voice sine\n  c/4 d/4 e/4 f/4');

  it('finds the note under a point', () => {
    const target = roll.blocks[2];
    const found = hitTest(roll, target.x + 2, target.y + target.h / 2);
    expect(found).toBe(target);
  });

  it('carries the note back, so a caller can find it in the text', () => {
    const found = hitTest(roll, roll.blocks[1].x + 2, roll.blocks[1].y);
    expect(found.note.line).toBe(4);
    expect(found.note.col).toBeGreaterThan(0);
  });

  it('finds nothing where there is nothing', () => {
    expect(hitTest(roll, roll.blocks[0].x + 2, roll.blocks[0].y + 100)).toBeNull();
  });
});
