import { parseScore } from '../audio/score.js';

/**
 * Text to score, for an editor rather than for the game.
 *
 * `parseScore` throws on the first thing it cannot read, which is right for a build:
 * a score that does not parse is not a score. It is wrong for someone typing, where
 * the file is unreadable for as long as it takes to finish the word. So this catches
 * and reports, the way `src/editor/draft.js` does for a level, and leaves the caller
 * to decide what to show meanwhile.
 *
 * @typedef {import('../audio/score.js').Score} Score
 */

/** What the editor opens with on a first visit, before any score has been loaded. */
export const STARTER_SCORE = `# A score. Every line is either a setting or a bar of notes.
# Press play, change something, and it carries on from where it was.

tempo 110
loop on

track pad
  voice sine
  gain 0.10
  octave 4
  env 0.2 0.3 0.7 0.4
  | [c e g]/1   |
  | [a c5 e5]/1 |
  | [f a c5]/1  |
  | [g b d5]/1  |

track bass
  voice triangle
  gain 0.22
  octave 2
  env 0.01 0.07 0.5 0.12
  | c/4 -/4 g/4 -/4 |
  | a/4 -/4 e/4 -/4 |
  | f/4 -/4 c/4 -/4 |
  | g/4 -/4 d/4 -/4 |

track lead
  voice square
  gain 0.14
  octave 5
  env 0.01 0.10 0.4 0.16
  | e/4  g/4  c6/4 -/4 |
  | a/4  c6/8 b/8  a/2 |
  | f/4  a/4  c6/4 -/4 |
  | g/2  ~/2           |

track hats
  voice noise
  gain 0.05
  env 0.001 0.03 0.0 0.03
  | x/8 -/8 x/8 -/8 x/8 -/8 x/8 -/8 |
  | x/8 -/8 x/8 -/8 x/8 -/8 x/8 -/8 |
  | x/8 -/8 x/8 -/8 x/8 -/8 x/8 -/8 |
  | x/8 -/8 x/8 -/8 x/8 x/16 x/16 x/8 x/8 |
`;

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

/**
 * @param {string} text
 * @returns {{score: Score|null, problems: string[]}} `score` is null exactly when
 *   `problems` is non-empty — the parser either reads the whole file or none of it.
 */
export function parseDraft(text) {
  try {
    return { score: parseScore(text), problems: [] };
  } catch (error) {
    return { score: null, problems: [message(error)] };
  }
}

/**
 * The character offset of a note's token in the text it was parsed from, for putting
 * a caret there. Counts the line breaks itself rather than trusting a stored offset,
 * so it stays right if the caller has been editing.
 *
 * @param {string} text
 * @param {{line: number, col: number}} at a note's `line` (from 1) and `col` (from 0)
 * @returns {number} clamped into the text, so a stale note cannot throw the caret out
 */
export function offsetOf(text, at) {
  const lines = text.split('\n');
  const line = Math.min(Math.max(at.line, 1), lines.length);
  let offset = 0;
  for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
  return offset + Math.min(at.col, lines[line - 1].length);
}
