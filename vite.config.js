// `vitest/config` re-exports Vite's own defineConfig, so the production build is
// unaffected by importing it from here — it just also understands `test`.
import { defineConfig } from 'vitest/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { scorePathFor, SCORES_DIR } from './src/audio-editor/save-path.js';
import { writeStage, LEVELS_FILE } from './src/editor/levels-source.js';

/**
 * A JSON POST that answers in plain text, which is the only shape either editor's Save
 * button needs. `handle` gets the parsed body and says what to reply with; anything it
 * throws becomes that reply, because everything it throws is a sentence written for the
 * author staring at the toast.
 *
 * @param {(body: any) => Promise<string>} handle
 * @returns {import('vite').Connect.NextHandleFunction}
 */
function saveEndpoint(handle) {
  return (req, res, next) => {
    if (req.method !== 'POST') return next();

    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      /** @param {number} status @param {string} message */
      const reply = (status, message) => {
        res.statusCode = status;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(message);
      };
      try {
        reply(200, await handle(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
      } catch (error) {
        reply(400, error instanceof Error ? error.message : String(error));
      }
    });
  };
}

/**
 * Lets both editors' Save buttons put their work back on disk.
 *
 * `apply: 'serve'` is load-bearing: this exists while `npm run dev` is running and at
 * no other time, so nothing resembling a write endpoint can reach the built site. Both
 * editors know that, and fall back to the clipboard when the endpoint is not there.
 *
 * Neither endpoint takes a path. A score's name picks one out of a single directory and
 * a stage's id picks a declaration out of a single file, and in both cases the rule for
 * turning one into the other lives under `src/` next to the editor that uses it, where
 * it can be tested without a server running.
 *
 * Scores are imported with `?raw` and `src/levels.js` is imported outright, so writing
 * either is picked up by the usual file watch: the game page reloads with the new music
 * or the new map, and so does the editor that wrote it.
 *
 * @returns {import('vite').Plugin}
 */
function editorWriter() {
  return {
    name: 'editor-writer',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;

      server.middlewares.use(
        '/__score',
        saveEndpoint(async ({ name, text }) => {
          const relative = scorePathFor(name);
          if (!relative) throw new Error(`"${name}" is not a name a score may have`);
          if (typeof text !== 'string') throw new Error('no score text to write');

          const file = resolve(root, relative);
          // The name has already been checked against a pattern with no dot and no
          // slash in it, so this cannot fail. It is here because a path guard that
          // depends on a regex somewhere else is one edit away from not being one.
          if (dirname(file) !== resolve(root, SCORES_DIR)) {
            throw new Error('that path is outside the scores directory');
          }

          await writeFile(file, text, 'utf8');
          return `Written to ${relative}`;
        }),
      );

      server.middlewares.use(
        '/__stage',
        saveEndpoint(async ({ stage }) => {
          // Read, edit, write. `writeStage` is given the file as it is this second
          // rather than a copy from startup, so a stage saved after `src/levels.js` has
          // been edited by hand is merged into that edit instead of over it.
          const file = resolve(root, LEVELS_FILE);
          const { text, action, constant } = writeStage(await readFile(file, 'utf8'), stage);
          await writeFile(file, text, 'utf8');
          return `${action === 'added' ? 'Added' : 'Updated'} ${constant} in ${LEVELS_FILE}`;
        }),
      );
    },
  };
}

// The site is served from https://<user>.github.io/claude-sandbox/, so assets
// must be referenced under the repo-name subpath. Without this base the built
// JS/CSS would 404 on GitHub Pages.
export default defineConfig({
  base: '/claude-sandbox/',
  plugins: [editorWriter()],
  build: {
    // Three pages: the game, the level editor, and the music editor. Naming the inputs
    // at all means naming every one — `index.html` stops being the implicit one the
    // moment this is here, and leaving it out would drop the game from the build.
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
        audioEditor: 'audio-editor.html',
      },
    },
  },
  test: {
    // No jsdom: three.js geometry and materials construct fine in plain Node.
    // Only WebGLRenderer needs a canvas, and that lives in main.js, which the
    // tests never import.
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
