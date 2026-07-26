# Tile Runner — a 3D browser game

A small [Three.js](https://threejs.org/) game where you move a cube around a
tile map built entirely from basic 3D shapes (boxes). Grid-based, top-down
movement with an angled overhead camera. Built with [Vite](https://vitejs.dev/)
and deployed for free to GitHub Pages via GitHub Actions.

**Play it live:** https://aaronsmithx.github.io/claude-sandbox/

## Controls

- **WASD** or **arrow keys** — move one tile at a time.
- **On touch devices**, an on-screen D-pad appears at the bottom of the screen.
  Tap an arrow for a single tile, or hold it to keep walking.
- Walls (grey) and water (blue) block movement; you roam the green floor tiles.

## Local development

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173/claude-sandbox/).

To produce a production build in `dist/`:

```bash
npm run build
npm run preview   # serve the built files locally
```

## Deployment

Every push to `main` (and manual "Run workflow" runs) triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the
site and publishes `dist/` to GitHub Pages.

> [!IMPORTANT]
> One-time setup in the repository settings:
> 1. **Settings → General → Default branch** → set to **`main`**.
> 2. **Settings → Pages → Build and deployment → Source** → select
>    **GitHub Actions**. Without this, the deploy job fails with a 404
>    (`Ensure GitHub Pages has been enabled`).
>
> After both are set, push to `main` (or run the workflow manually) and the game
> goes live at the URL above.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, full-screen canvas, controls hint, D-pad markup/styles. |
| `src/main.js` | Renderer, scene, camera, lights, and the render loop. |
| `src/tilemap.js` | The map grid, tile meshes, and walkability helpers. |
| `src/player.js` | The player cube and tile-to-tile movement. |
| `src/input.js` | Keyboard → grid-move mapping. |
| `src/touch-controls.js` | On-screen D-pad for touch devices. |
| `src/camera-follow.js` | Overhead camera that follows the player. |
| `vite.config.js` | Sets the `/claude-sandbox/` base path for Pages. |

## Making it your own

- **Redesign the level:** edit the `MAP` array in `src/tilemap.js`
  (`0` = floor, `1` = wall, `2` = water).
- **Change the player shape/color:** tweak the geometry and material in
  `src/player.js`.
- **Adjust the camera angle:** change the `offset` in `src/camera-follow.js`.
