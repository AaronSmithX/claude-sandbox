/**
 * The checks a score has to pass, as data rather than as assertions.
 *
 * These are the mistakes that are easy to make while writing music in a text file and
 * impossible to hear as the thing they are: a track a beat and a half short, so the
 * loop lurches every time round; bar lines that do not add up, because the parser
 * treats them as decoration and never counts them; a track whose gain drowns the rest.
 * They are not taste — a score that passes them can still be dull music; a score that
 * fails one is broken in a way no amount of listening will localise.
 *
 * The reason they are a function returning strings rather than a test file full of
 * `expect` calls is the reason `src/level-checks.js` gives: two callers want them.
 * `test/score-checks.test.js` runs them over the shipped scores in CI, and the music
 * editor runs them over a half-typed score on every keystroke. One copy means the
 * editor cannot bless a score the suite will later reject.
 *
 * @typedef {import('./score.js').Score} Score
 * @typedef {import('./score.js').Track} Track
 *
 * @typedef {object} Check
 * @property {string} label what the score is being asked, phrased so it reads as a
 *   test name: "loops without a seam".
 * @property {string[]} problems empty when the score passes; otherwise one sentence
 *   per offending track, naming it.
 */

/** Beats per bar. Everything here is four-four; nothing in the format says otherwise. */
const BEATS_PER_BAR = 4;

/** Loud enough to be shouting over the rest of the mix. */
const MAX_TRACK_GAIN = 0.3;

/**
 * Where the sum of every track's gain starts to risk the master clipping. Notes do not
 * all peak together, so this is a headroom rule of thumb rather than a hard ceiling.
 */
const MAX_TOTAL_GAIN = 0.8;

/**
 * Above about here a square or saw wave stops being a melody and starts being a
 * whistle. g6 is 1568Hz and is fine; c7 is 2093Hz and is not.
 */
const SHRILL_HZ = 1600;

/** Seconds of slack when comparing two lengths — these are floating-point sums. */
const EPSILON = 1e-6;

/**
 * Where a track ends, in seconds. Not the last note's `time`: a whole note starting in
 * the final bar ends four beats after it starts.
 *
 * @param {Track} track
 */
const endOf = (track) =>
  track.notes.reduce((latest, note) => Math.max(latest, note.time + note.dur), 0);

/** @param {number} seconds @param {Score} score */
const inBeats = (seconds, score) => (seconds * score.tempo) / 60;

/** @param {number} n */
const round = (n) => Math.round(n * 100) / 100;

/**
 * Runs every check over one score.
 *
 * @param {Score} score
 * @returns {Check[]}
 */
export function checkScore(score) {
  /** @type {Check[]} */
  const checks = [];

  // A loop is the only thing that has a seam. A sound effect is over when it is over,
  // and holding one to a whole number of bars would be arithmetic for its own sake —
  // so both of the length checks below sit behind `loop`.
  if (score.loop) {
    checks.push({
      label: 'loops without a seam',
      // Every track restarts together, so a track that ends early is followed by
      // silence until the longest one comes round — audible as a lurch once a loop,
      // and maddening to track down by ear.
      problems: score.tracks
        .filter((track) => Math.abs(endOf(track) - score.duration) > EPSILON)
        .map(
          (track) =>
            `"${track.name}" is ${round(inBeats(score.duration - endOf(track), score))} beats short of the others, ` +
            `so the loop holds silence on it before coming round`,
        ),
    });

    checks.push({
      label: 'fills whole bars',
      // Bar lines are decoration to the parser — it never counts them, so a bar with
      // one beat too many in it reads perfectly and plays wrong. This is what counts.
      problems: score.tracks
        .map((track) => ({ track, bars: inBeats(endOf(track), score) / BEATS_PER_BAR }))
        .filter(({ bars }) => Math.abs(bars - Math.round(bars)) > EPSILON)
        .map(
          ({ track, bars }) =>
            `"${track.name}" is ${round(bars)} bars long — its bar lines do not add up`,
        ),
    });
  }

  checks.push({
    label: 'keeps every track under its own ceiling',
    problems: score.tracks
      .filter((track) => track.gain > MAX_TRACK_GAIN)
      .map((track) => `"${track.name}" is at gain ${track.gain}, over ${MAX_TRACK_GAIN}`),
  });

  const total = score.tracks.reduce((sum, track) => sum + track.gain, 0);
  checks.push({
    label: 'leaves the master some headroom',
    problems:
      total <= MAX_TOTAL_GAIN
        ? []
        : [
            `the tracks sum to gain ${round(total)}, over ${MAX_TOTAL_GAIN} — ` +
              `turn something down rather than letting the master do it`,
          ],
  });

  checks.push({
    label: 'has something to say on every track',
    // A track of nothing but rests is dead weight in the file and a sign an edit went
    // somewhere it was not meant to. Note that a noise track's rests and hits both
    // arrive with no pitch, which is what `hit` is for.
    problems: score.tracks
      .filter((track) => !track.notes.some((note) => note.freq !== null || note.hit))
      .map((track) => `"${track.name}" is nothing but rests`),
  });

  checks.push({
    label: 'stays out of the shrill register',
    problems: score.tracks
      .filter((track) => track.voice === 'square' || track.voice === 'saw')
      .flatMap((track) => {
        const top = track.notes.reduce((hz, note) => Math.max(hz, note.freq ?? 0), 0);
        return top > SHRILL_HZ
          ? [
              `"${track.name}" reaches ${Math.round(top)}Hz on a ${track.voice} wave — ` +
                `over ${SHRILL_HZ}Hz that is a whistle, not a melody`,
            ]
          : [];
      }),
  });

  return checks;
}

/**
 * Every problem across every check, flattened — for a caller that wants a yes or no
 * rather than a report.
 *
 * @param {Score} score
 * @returns {string[]}
 */
export function scoreProblems(score) {
  return checkScore(score).flatMap((check) => check.problems);
}
