/**
 * Where the music editor is allowed to write, and nowhere else.
 *
 * This is a dev-server endpoint on a machine that is also running the editor, so the
 * threat is not really an attacker — it is a name field with a `../` typed into it and
 * a Save button next to it. It lives here rather than inside the Vite plugin so it can
 * be tested without a server: the plugin does the writing, this decides whether to.
 *
 * No `node:path` import on purpose. Everything under `src/` is browser code, and the
 * checker is configured on the understanding that none of it reaches for Node.
 */

/** Relative to the repository root. */
export const SCORES_DIR = 'src/audio/scores';

/**
 * The same shape a score file already has: lower case, digits and dashes. It admits no
 * dot and no slash, so `..`, `../x` and an absolute path are all refused before any
 * path is built out of them.
 */
const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * @param {unknown} name
 * @returns {string|null} the path to write, relative to the repository root, or null
 *   if the name is not one a score may have.
 */
export function scorePathFor(name) {
  if (typeof name !== 'string' || !SAFE_NAME.test(name)) return null;
  return `${SCORES_DIR}/${name}.txt`;
}
