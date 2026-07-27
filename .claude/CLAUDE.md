# Project instructions

## Verification

Verify changes with code-based tests — the Vitest suite in `test/`, driven through
`tickWorld` via `test/helpers/level.js`. Add or extend a test rather than checking
behaviour by hand.

Do **not** drive a real browser (Playwright, Puppeteer, or similar) for routine
testing or verification. Only do that if I explicitly ask for it.

Commands: `npm test` (once), `npm run test:watch`, `npm run build`.
