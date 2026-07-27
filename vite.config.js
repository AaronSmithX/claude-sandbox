// `vitest/config` re-exports Vite's own defineConfig, so the production build is
// unaffected by importing it from here — it just also understands `test`.
import { defineConfig } from 'vitest/config';

// The site is served from https://<user>.github.io/claude-sandbox/, so assets
// must be referenced under the repo-name subpath. Without this base the built
// JS/CSS would 404 on GitHub Pages.
export default defineConfig({
  base: '/claude-sandbox/',
  build: {
    // Two pages: the game, and the level editor beside it. Naming the inputs at all
    // means naming both — `index.html` stops being the implicit one the moment this
    // is here, and leaving it out would drop the game from the build.
    rollupOptions: {
      input: { main: 'index.html', editor: 'editor.html' },
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
