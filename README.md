# Tile Runner — a 3D browser game

A small [Three.js](https://threejs.org/) puzzle game where you move a cube
around a tile map built entirely from basic 3D shapes. Collect keys, open the
doors they match, flip switches to raise and lower columns, and find the star.
Grid-based movement with an angled overhead camera. Built with
[Vite](https://vitejs.dev/) and deployed for free to GitHub Pages via GitHub
Actions.

**Play it live:** https://aaronsmithx.github.io/claude-sandbox/

## Controls

- **WASD** or **arrow keys** — move one tile at a time.
- **On touch devices**, an on-screen D-pad appears at the bottom of the screen.
  Tap an arrow for a single tile, or hold it to keep walking.

## How to play

Find the **star** to win. The HUD along the top shows what you are carrying;
each icon lights up once you pick that item up.

| Thing | What it does |
| --- | --- |
| **Keys** (gold, violet, white) | Opens a door of the *same colour*, and is spent doing so. |
| **Doors** | Blocked until you hold the matching key. |
| **Inner tube** | Once collected, you can move across water tiles. |
| **Switches** (red, cyan, pink) | Stepping on one *swaps* that colour's columns: every raised column of that colour drops, and every retracted one pops up. |
| **Columns** | Four posts that rise out of a tile. Raised columns block you; retracted ones don't. |
| **Star** | Reaching it wins the level. |

Walls (grey) always block movement; you roam the green floor tiles. Every
mechanic is required — the level cannot be finished while skipping any of them.

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
| `index.html` | Page shell, canvas, hint, HUD, D-pad and win overlay markup/styles. |
| `src/main.js` | Renderer, scene, camera, lights, wiring, and the render loop. |
| `src/tilemap.js` | The map, tile meshes, and all the level rules. |
| `src/player.js` | The player cube and tile-to-tile movement. |
| `src/inventory.js` | What the player is carrying. |
| `src/hud.js` | The inventory bar at the top of the screen. |
| `src/input.js` | Keyboard → grid-move mapping. |
| `src/touch-controls.js` | On-screen D-pad for touch devices. |
| `src/camera-follow.js` | Overhead camera that follows the player. |
| `vite.config.js` | Sets the `/claude-sandbox/` base path for Pages. |

## Making it your own

- **Redesign the level:** edit the `MAP` array in `src/tilemap.js`. It's a grid
  of characters, documented by the `LEGEND` right above it:

  ```
  #  wall          .  floor        ~  water       @  player spawn
  *  star (goal)   O  inner tube

  g v w   keys  — gold, violet, white
  G V W   doors — gold, violet, white

  1 2 3   switches — red, cyan, pink
  X Y Z   columns that start RAISED    — red, cyan, pink
  x y z   columns that start RETRACTED — red, cyan, pink
  ```

  Uppercase is the thing that blocks you, lowercase its unblocked partner. A
  switch swaps the two groups of its colour, so pair `X` with `x` to make one
  press open a path and close another.
- **Recolour the items:** `KEY_COLORS` and `SWITCH_COLORS` in `src/tilemap.js`
  drive both the 3D meshes and the HUD icons.
- **Change the player shape/color:** tweak the geometry and material in
  `src/player.js`.
- **Adjust the camera angle:** change the `offset` in `src/camera-follow.js`.
