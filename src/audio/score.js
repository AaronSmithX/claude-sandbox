/**
 * The score format, and its parser.
 *
 * A score is a plain text file. Music and sound effects use the same format, so
 * there is one thing to learn and one code path to maintain:
 *
 *     tempo 104              # quarter notes per minute
 *     loop on                # "off" for a one-shot, e.g. a sound effect
 *
 *     track bass             # a new track; tracks play together
 *       voice triangle       # sine | square | triangle | saw | noise
 *       gain 0.30            # 0..1, this track's level in the mix
 *       octave 2             # the octave a bare note name means
 *       env 0.01 0.07 0.55 0.14    # attack, decay, sustain (0..1), release
 *       | a/4  a/8 -/8  e/4 | f/4  f/8 -/8  c/4 |
 *
 * A note is `pitch/duration`. The slash matters: `c4` on its own would be
 * ambiguous between "C in octave 4" and "a C quarter note".
 *
 *   pitch     a-g with optional # or b, and an optional octave: `c`, `f#`, `eb5`
 *             `-` a rest
 *             `~` a tie, which lengthens the note before it
 *             `x` a hit, for noise tracks
 *   duration  1, 2, 4, 8, 16 or 32 (whole to thirty-second), optionally
 *             followed by `.` to dot it (half again as long). Leave the duration
 *             off entirely and the previous one is reused.
 *   `[...]`   a chord: `[c e g]/2` is three notes struck together, for the length
 *             of a half note. A track is otherwise one note at a time, so without
 *             this a triad costs three tracks.
 *   `|`       a bar line. Ignored — it is there so you can read the file.
 *   `#`       starts a comment, on its own or after a space. `c#5` is a note, not a
 *             `c` followed by a comment.
 */

const VOICES = new Set(['sine', 'square', 'triangle', 'saw', 'noise']);
const DURATIONS = new Set([1, 2, 4, 8, 16, 32]);
const SEMITONES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const DEFAULT_ENVELOPE = [0.01, 0.08, 0.5, 0.15];

/**
 * @typedef {{time: number, dur: number, freq: number|null, hit: boolean, line: number, col: number}} Note
 *   `time` and `dur` are in seconds. `freq` is null for a rest — and also for a hit on
 *   a noise track, which has no pitch to give, so `hit` is what tells the two apart.
 *   Without it a drum track's rests are silent gaps that nothing can distinguish from
 *   its beats, and the pattern plays as an unbroken run.
 *   `line` (from 1) and `col` (from 0) are where the note was written, which is what
 *   lets the music editor's piano roll put the caret on the note you clicked.
 * @typedef {{name: string, voice: string, gain: number, env: number[], octave?: number, notes: Note[]}} Track
 * @typedef {{tempo: number, loop: boolean, tracks: Track[], duration: number}} Score
 */

/**
 * Splits a line of notes into tokens, each with the column it started at. A plain
 * whitespace split cannot do this on its own: `[c e g]/2` is one token with spaces
 * inside it. Anything that is not a bracket group falls through to a run of non-space,
 * so an unclosed `[` still arrives as a token and can be complained about by name.
 *
 * The column is what lets a caller point back at the text — the music editor puts the
 * caret on the note you clicked in its piano roll.
 *
 * @param {string} line comment already stripped, but *not* trimmed: leading space has
 *   to survive or every column after it would be wrong.
 * @returns {{text: string, col: number}[]}
 */
function tokenise(line) {
  return [...line.matchAll(/\[[^\]]*\](?:\/\d+\.?)?|\S+/g)].map((m) => ({
    text: m[0],
    col: m.index,
  }));
}

/** Equal temperament, with a4 at 440Hz. */
export function noteToFreq(letter, accidental, octave) {
  const base = SEMITONES[letter];
  if (base === undefined) throw new Error(`Unknown note "${letter}"`);
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  // MIDI note 69 is a4. Octaves change at C, as in scientific pitch notation.
  const midi = 12 * (octave + 1) + base + shift;
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * @param {string} text the contents of a score file
 * @returns {Score}
 * @throws {Error} naming the line, for anything it cannot read
 */
export function parseScore(text) {
  let tempo = 120;
  let loop = false;
  /** @type {Track[]} */
  const tracks = [];

  /** @type {?Track} */
  let track = null;
  let beat = 0; // where the current track has got to, in quarter notes
  let lastDuration = 4;
  // Where the notes struck together most recently begin, so a tie can lengthen all of
  // a chord rather than whichever voice of it happened to be written last.
  let groupStart = -1;

  const lines = text.split('\n');

  lines.forEach((raw, index) => {
    // A `#` only opens a comment where a token could start. It is also the sharp sign,
    // and stripping from the first `#` anywhere turned `f#/4` into `f` — silently, with
    // the rest of the line going with it.
    const uncommented = raw.replace(/(^|\s)#.*$/, '');
    const line = uncommented.trim();
    if (!line) return;

    /**
     * Refuses the score, naming the line. Never returns — declared as a type rather
     * than with `@returns`, because that is the form that lets the checker read
     * `if (!track) fail(...)` as a check and not a wish.
     * @type {(message: string) => never}
     */
    const fail = (message) => {
      throw new Error(`Score line ${index + 1}: ${message}`);
    };

    const [word, ...rest] = line.split(/\s+/);

    switch (word) {
      case 'tempo': {
        const value = Number(rest[0]);
        if (!(value > 0)) fail(`tempo must be a positive number, got "${rest[0]}"`);
        tempo = value;
        return;
      }

      case 'loop': {
        if (rest[0] !== 'on' && rest[0] !== 'off') fail('loop must be "on" or "off"');
        loop = rest[0] === 'on';
        return;
      }

      case 'track': {
        if (!rest[0]) fail('track needs a name');
        track = {
          name: rest[0],
          voice: 'sine',
          gain: 0.2,
          env: [...DEFAULT_ENVELOPE],
          octave: 4,
          notes: [],
        };
        tracks.push(track);
        beat = 0;
        lastDuration = 4;
        groupStart = -1;
        return;
      }

      case 'voice': {
        if (!track) fail('voice must come after a track');
        if (!VOICES.has(rest[0])) {
          fail(`unknown voice "${rest[0]}", expected one of ${[...VOICES].join(', ')}`);
        }
        track.voice = rest[0];
        return;
      }

      case 'gain': {
        const value = Number(rest[0]);
        if (!track) fail('gain must come after a track');
        if (!(value >= 0 && value <= 1)) fail(`gain must be between 0 and 1, got "${rest[0]}"`);
        track.gain = value;
        return;
      }

      case 'octave': {
        const value = Number(rest[0]);
        if (!track) fail('octave must come after a track');
        if (!Number.isInteger(value)) fail(`octave must be a whole number, got "${rest[0]}"`);
        track.octave = value;
        return;
      }

      case 'env': {
        if (!track) fail('env must come after a track');
        const values = rest.map(Number);
        if (values.length !== 4 || values.some((v) => !(v >= 0))) {
          fail('env needs four non-negative numbers: attack decay sustain release');
        }
        track.env = values;
        return;
      }

      default: {
        if (!track) fail(`expected a directive or a track, got "${word}"`);

        // `uncommented` rather than `line`: trimming would shift every column.
        for (const { text: token, col } of tokenise(uncommented)) {
          if (token === '|') continue; // bar line, for the reader's benefit only

          const chord = token.startsWith('[');
          if (chord && !token.includes(']')) fail(`"${token}" is missing its closing "]"`);

          const match = chord
            ? token.match(/^\[([^\]]*)\](?:\/(\d+)(\.?))?$/)
            : token.match(/^([a-g][#b]?-?\d*|[-~x])(?:\/(\d+)(\.?))?$/);
          if (!match) fail(`cannot read "${token}"`);

          const [, body, rawDuration, dotted] = match;

          let duration = lastDuration;
          if (rawDuration !== undefined) {
            duration = Number(rawDuration);
            if (!DURATIONS.has(duration)) {
              fail(`"${token}" has an odd note length; use ${[...DURATIONS].join(', ')}`);
            }
            lastDuration = duration;
          }
          // A quarter note is one beat, so a note of value n lasts 4/n beats.
          const beats = (4 / duration) * (dotted ? 1.5 : 1);

          if (body === '~') {
            if (groupStart < 0) fail('a tie needs a note before it');
            // Every voice of the last chord, not just the last of them. `groupStart`
            // deliberately stays put, so `c/4 ~/4 ~/4` is one note three beats long.
            for (let i = groupStart; i < track.notes.length; i++) {
              track.notes[i].dur += beats;
            }
            beat += beats;
            continue;
          }

          const pitches = chord ? body.trim().split(/\s+/).filter(Boolean) : [body];
          if (pitches.length === 0) fail(`"${token}" is an empty chord`);

          groupStart = track.notes.length;

          for (const pitch of pitches) {
            if (chord && (pitch === '-' || pitch === '~' || pitch === 'x')) {
              fail(`"${pitch}" cannot go inside a chord; a chord is notes struck together`);
            }

            /** @type {?number} */
            let freq = null;
            let hit = false;
            if (pitch === 'x') {
              if (track.voice !== 'noise') fail('"x" is a noise hit; set "voice noise"');
              hit = true;
            } else if (pitch !== '-') {
              const parts = pitch.match(/^([a-g])([#b]?)(-?\d*)$/);
              if (!parts) fail(`cannot read the pitch "${pitch}"`);
              const [, letter, accidental, octave] = parts;
              freq = noteToFreq(
                letter,
                accidental,
                octave === '' ? (track.octave ?? 4) : Number(octave),
              );
            }

            track.notes.push({ time: beat, dur: beats, freq, hit, line: index + 1, col });
          }

          // Once per group, not once per note: a chord takes up the time of one note.
          beat += beats;
        }
      }
    }
  });

  if (!tracks.length) throw new Error('Score has no tracks');

  // Beats become seconds only now, so a tempo line anywhere in the file applies
  // to the whole of it.
  const secondsPerBeat = 60 / tempo;
  let duration = 0;
  for (const t of tracks) {
    for (const note of t.notes) {
      note.time *= secondsPerBeat;
      note.dur *= secondsPerBeat;
      duration = Math.max(duration, note.time + note.dur);
    }
    delete t.octave; // an authoring convenience, not part of the played score
  }

  // `duration` is the loop point: every track restarts together, so a track
  // shorter than the longest one is followed by silence until the loop comes
  // round. Give each track the same number of bars to avoid that.
  return { tempo, loop, tracks, duration };
}
