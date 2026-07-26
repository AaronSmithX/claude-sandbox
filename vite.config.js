import { defineConfig } from 'vite';

// The site is served from https://<user>.github.io/claude-sandbox/, so assets
// must be referenced under the repo-name subpath. Without this base the built
// JS/CSS would 404 on GitHub Pages.
export default defineConfig({
  base: '/claude-sandbox/',
});
