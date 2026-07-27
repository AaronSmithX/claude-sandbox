// `vitest/config` re-exports Vite's own defineConfig, so the production build is
// unaffected by importing it from here — it just also understands `test`.
import { defineConfig } from 'vitest/config';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { scorePathFor, SCORES_DIR } from './src/audio-editor/save-path.js';

/**
 * Lets the music editor's Save button put a score back on disk.
 *
 * `apply: 'serve'` is load-bearing: this exists while `npm run dev` is running and at
 * no other time, so nothing resembling a write endpoint can reach the built site. The
 * editor knows that, and falls back to the clipboard when the endpoint is not there.
 *
 * Scores are imported with `?raw`, so writing one is picked up by the usual file watch
 * and the game page reloads with the new music.
 *
 * @returns {import('vite').Plugin}
 */
function scoreWriter() {
  return {
    name: 'score-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__score', (req, res, next) => {
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
            const { name, text } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const relative = scorePathFor(name);
            if (!relative) return reply(400, `"${name}" is not a name a score may have`);
            if (typeof text !== 'string') return reply(400, 'no score text to write');

            const root = server.config.root;
            const file = resolve(root, relative);
            // The name has already been checked against a pattern with no dot and no
            // slash in it, so this cannot fail. It is here because a path guard that
            // depends on a regex somewhere else is one edit away from not being one.
            if (dirname(file) !== resolve(root, SCORES_DIR)) {
              return reply(400, 'that path is outside the scores directory');
            }

            await writeFile(file, text, 'utf8');
            reply(200, `wrote ${relative}`);
          } catch (error) {
            reply(400, error instanceof Error ? error.message : String(error));
          }
        });
      });
    },
  };
}

// The site is served from https://<user>.github.io/claude-sandbox/, so assets
// must be referenced under the repo-name subpath. Without this base the built
// JS/CSS would 404 on GitHub Pages.
export default defineConfig({
  base: '/claude-sandbox/',
  plugins: [scoreWriter()],
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
