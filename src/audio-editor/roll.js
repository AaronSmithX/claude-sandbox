/**
 * The piano roll: a score as a picture.
 *
 * Split in two on purpose. `layout` is arithmetic — seconds across, pitch up, and
 * nothing that needs a canvas — so `test/audio-roll.test.js` can check it in Node the
 * way `test/editor-draft.test.js` checks the level editor's text handling. `paint`
 * takes what `layout` worked out and draws it, and is the only part a test cannot see.
 *
 * Time runs left to right across the full width, so one screen is one loop. Pitch
 * shares a single axis across every track, which is the point: harmony is a thing you
 * can see lining up (or not) between tracks, and a lane per track would hide it.
 * Noise has no pitch to plot, so each noise track gets a strip along the bottom.
 *
 * @typedef {import('../audio/score.js').Score} Score
 * @typedef {import('../audio/score.js').Note} Note
 *
 * @typedef {object} Block one note as a rectangle
 * @property {number} x @property {number} y @property {number} w @property {number} h
 * @property {number} track index into `Score.tracks`
 * @property {Note} note the note it was made from, so a click can lead back to the text
 *
 * @typedef {object} Layout
 * @property {number} width @property {number} height
 * @property {Block[]} blocks
 * @property {number[]} bars x of each bar line
 * @property {number[]} beats x of each beat that is not a bar line
 * @property {{y: number, label: string}[]} guides a horizontal line per C, labelled
 * @property {{name: string, color: string, pitched: boolean}[]} tracks
 * @property {number} pitchHeight where the pitched area stops and the noise strips start
 */

/** A noise strip is this tall, whatever else is going on. */
const NOISE_ROW = 12;

/** Nothing thinner than this, or a sixteenth note at a slow tempo vanishes. */
const MIN_BLOCK = 2;

/** A little air above and below the highest and lowest notes, in semitones. */
const PITCH_PADDING = 2;

/** @param {number} hz */
export const freqToMidi = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** @param {number} midi */
export const midiToName = (midi) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/**
 * A colour per track, spread around the wheel. Fixed by position rather than by name,
 * so a track keeps its colour between the roll and the buttons under it.
 * @param {number} index
 */
export const trackColor = (index) => `hsl(${(index * 67 + 200) % 360} 72% 64%)`;

/**
 * @param {Score} score
 * @param {{width: number, height: number}} size
 * @returns {Layout}
 */
export function layout(score, { width, height }) {
  const tracks = score.tracks.map((track, i) => ({
    name: track.name,
    color: trackColor(i),
    pitched: track.voice !== 'noise',
  }));

  const noiseTracks = score.tracks
    .map((track, i) => i)
    .filter((i) => !tracks[i].pitched && score.tracks[i].notes.some((n) => n.hit));

  const pitchHeight = Math.max(0, height - noiseTracks.length * NOISE_ROW);

  // The range to plot. Taken from the notes rather than fixed, so a bass part fills the
  // picture instead of sitting in a sliver at the bottom of all 88 keys.
  let low = Infinity;
  let high = -Infinity;
  for (const track of score.tracks) {
    for (const note of track.notes) {
      if (note.freq === null) continue;
      const midi = freqToMidi(note.freq);
      low = Math.min(low, midi);
      high = Math.max(high, midi);
    }
  }
  if (low > high) [low, high] = [60, 72]; // nothing pitched at all; an octave will do
  low -= PITCH_PADDING;
  high += PITCH_PADDING;

  const rows = high - low + 1;
  const rowHeight = pitchHeight / rows;
  const seconds = score.duration || 1;
  const xOf = (time) => (time / seconds) * width;

  /** @type {Block[]} */
  const blocks = [];
  score.tracks.forEach((track, index) => {
    const noiseLane = noiseTracks.indexOf(index);
    for (const note of track.notes) {
      if (note.freq === null && !note.hit) continue; // a rest draws nothing

      const x = xOf(note.time);
      const w = Math.max(MIN_BLOCK, xOf(note.time + note.dur) - x - 1);

      if (note.freq === null) {
        // A hit: no pitch, so it goes in this track's strip along the bottom.
        blocks.push({
          x,
          y: pitchHeight + noiseLane * NOISE_ROW + 2,
          w,
          h: NOISE_ROW - 4,
          track: index,
          note,
        });
        continue;
      }

      const midi = freqToMidi(note.freq);
      blocks.push({
        x,
        // `high` at the top: pitch goes up the screen, and canvas y goes down it.
        y: (high - midi) * rowHeight,
        w,
        h: Math.max(MIN_BLOCK, rowHeight - 1),
        track: index,
        note,
      });
    }
  });

  // A quarter note is one beat, whatever the tempo — the parser has already turned
  // both into seconds, so this turns them back to find where the lines go.
  const secondsPerBeat = 60 / score.tempo;
  /** @type {number[]} */
  const bars = [];
  /** @type {number[]} */
  const beats = [];
  for (let beat = 0; beat * secondsPerBeat < seconds; beat++) {
    (beat % 4 === 0 ? bars : beats).push(xOf(beat * secondsPerBeat));
  }

  /** @type {{y: number, label: string}[]} */
  const guides = [];
  for (let midi = low; midi <= high; midi++) {
    if (midi % 12 === 0) guides.push({ y: (high - midi) * rowHeight, label: midiToName(midi) });
  }

  return { width, height, blocks, bars, beats, guides, tracks, pitchHeight };
}

/**
 * The topmost block under a point, or null. Searched backwards so it agrees with what
 * `paint` leaves visible when two notes overlap.
 *
 * @param {Layout} view
 * @param {number} x @param {number} y
 * @returns {Block|null}
 */
export function hitTest(view, x, y) {
  for (let i = view.blocks.length - 1; i >= 0; i--) {
    const b = view.blocks[i];
    // A block can be two pixels tall, which is a hard thing to click, so the catch is
    // a little taller than the paint.
    if (x >= b.x && x <= b.x + b.w && y >= b.y - 3 && y <= b.y + b.h + 3) return b;
  }
  return null;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Layout} view
 * @param {object} [options]
 * @param {number} [options.playhead] seconds into the score, or undefined for stopped
 * @param {number} [options.duration] the score's length in seconds, for the playhead
 * @param {(name: string) => boolean} [options.isMuted]
 */
export function paint(ctx, view, { playhead, duration, isMuted } = {}) {
  const { width, height } = view;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#080d1a';
  ctx.fillRect(0, 0, width, height);

  // Guides first, so notes sit on top of them.
  ctx.strokeStyle = 'rgba(120, 150, 220, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const guide of view.guides) {
    ctx.moveTo(0, Math.round(guide.y) + 0.5);
    ctx.lineTo(width, Math.round(guide.y) + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 150, 220, 0.10)';
  ctx.beginPath();
  for (const x of view.beats) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 150, 220, 0.32)';
  ctx.beginPath();
  for (const x of view.bars) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  ctx.stroke();

  // The line between pitch and percussion.
  ctx.strokeStyle = 'rgba(120, 150, 220, 0.32)';
  ctx.beginPath();
  ctx.moveTo(0, Math.round(view.pitchHeight) + 0.5);
  ctx.lineTo(width, Math.round(view.pitchHeight) + 0.5);
  ctx.stroke();

  for (const block of view.blocks) {
    const track = view.tracks[block.track];
    ctx.globalAlpha = isMuted?.(track.name) ? 0.16 : 1;
    ctx.fillStyle = track.color;
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(160, 180, 230, 0.5)';
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'top';
  for (const guide of view.guides) ctx.fillText(guide.label, 3, guide.y + 1);

  if (playhead !== undefined && duration) {
    const x = (playhead / duration) * width;
    ctx.strokeStyle = '#78d0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}
