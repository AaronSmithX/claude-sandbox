# Tile Runner — a 3D browser game

A small [Three.js](https://threejs.org/) game where you walk a little person
around a tile map built entirely from basic 3D shapes. Collect keys, open the
doors they match, flip switches to raise and lower columns, dodge the patrolling
spiked shells, and find the star — across a short run of stages, each one asking
for a little more. Grid-based movement with an angled overhead
camera, and a soundtrack synthesised from text files. Built with
[Vite](https://vitejs.dev/) and deployed for free to GitHub Pages via GitHub
Actions.

**Play it live:** https://aaronsmithx.github.io/claude-sandbox/

## Controls

- **WASD** or **arrow keys** — a tap is one tile; hold a direction and you keep
  walking that way, tile after tile, with no pause between them.
- **R** — restart the stage you are on, from the top.
- **Enter** or **Space** — the button on whichever panel is up: start, next stage,
  retry, play again.
- **M**, or the speaker button in the top right — mute and unmute. The setting is
  remembered.
- **On touch devices**, an on-screen D-pad appears at the bottom of the screen. It
  behaves the same way: tap for one tile, hold to keep walking.

Press a second direction while walking and it takes the next tile — the tile in
flight always finishes first, so movement stays tile-locked. Let that one go and
you carry on in whichever direction is still held.

Sound starts on your first key press or tap, because browsers do not allow audio
to begin before the page has been interacted with.

## Stages

The game is a short run of stages, played in order from the title screen: four
that each introduce one thing, then the original single level as the finale with
everything on it at once.

| Stage | What it is for |
| --- | --- |
| **First Steps** | Walking, and holding a direction to keep walking. |
| **Lock and Key** | Two keys, two doors, in an order that cannot be skipped. |
| **Thin Ice** | Three ice runs, the last of which delivers you onto the star. |
| **Up and Over** | A stair up, a walkway round, and a chute down into the star's pen. |
| **The Gauntlet** | The 16x16 original: every mechanic, and patrols. |

Clearing a stage pauses on a panel; the last one ends the game. Dying restarts the
stage rather than the run, and **R** restarts it whenever you like.

Stages live in `src/levels.js` as rows of legend characters — content only. Adding
one is a data change: append a `{ id, name, hint, rows }` entry and
`test/levels.test.js` will hold the new map to the same checks as the rest (one
spawn, a reachable star, a key for every door, no switch that can seal you in).

## How to play

Find the **star** on each stage. The HUD along the top shows what this stage
expects you to find, and each icon lights up once you have it; the label in the
corner says which stage you are on.

| Thing | What it does |
| --- | --- |
| **Keys** (gold, violet, white) | Opens a door of the *same colour*, and is spent doing so. |
| **Doors** | Blocked until you hold the matching key. |
| **Inner tube** | Once collected, you can move across water tiles — you sink down into them, riding the tube. |
| **Ice** | Step onto it and you keep going that way, tile after tile, until you are off the ice or something stops you. You have no say until you come to rest, so look before you step. |
| **Switches** (red, cyan, pink) | Stepping on one *swaps* that colour's columns: every raised column of that colour drops, and every retracted one pops up. Only one switch of a colour is down at a time — pressing one lets the others back up — and a switch already down does nothing, so you cannot toggle columns on the spot by standing on the same one twice. |
| **Columns** | Four posts that rise out of a tile. Raised ones block you; retracted ones sit just proud of the floor, so you can see where they are and walk straight over them. |
| **Raised floor** | Ground that sits higher up. You cannot step between two heights: a ledge is a wall you can see over. |
| **Stairs** | Join two floors one level apart, and work in both directions — but only along the way they run. Their flanks are the side of a staircase, not a way on. |
| **Slides** | A chute. You can only get on at the top, and once you do you ride it to the bottom — there is no walking back up one. |
| **Star** | Reaching it clears the stage. |
| **Enemies** | A spiked shell that patrols a fixed route on its own timer. Touching one restarts the stage. |

Walls (grey) always block movement; you roam the green floor tiles. On every stage
each mechanic it contains is required — none of them can be finished by skipping
one.

### Ice

A slide is one move: you press a direction once and keep going that way until the
tile you arrive on is not ice, or the way ahead is blocked. Input is ignored for
the whole of it. Anything you come to rest on still happens — a key is collected,
a switch is pressed, the star is the star — but a **shut door stops you** rather
than opening, so a slide can never spend a key on your behalf. Patrols cross ice
like any other floor; only the player slides.

### Height

Floors can sit higher up, half a tile per level. Two tiles at different heights are
not neighbours: you take a **stair** between them, along the way it runs, or you go
round. Anything else is a ledge, and a ledge stops you.

A **slide** is a chute between two heights. It can only be entered at its top and
only ridden downhill, and the ride is the ice ride — one press, and you are a
passenger until you come to rest. A chute of several tiles falls evenly across them,
so a long one reads as one continuous drop.

Both a stair and a chute work the rest out from the ground on either side of them: a
map states its elevation once, with its floors, and the ramps agree with it or the
stage refuses to load. Patrols use neither, so a raised walkway is a room of its
own — the way a door shuts a patrol into one.

### Enemies

Enemies patrol **on their own clocks**, whether or not you are moving — standing
still is not safe. Each one keeps its own period (a little over half a second per
tile, and no two neighbours the same), so patrols drift out of phase with each
other rather than marching in step. You move a tile in 0.14s, roughly four times
quicker, so a patrol can always be out-walked or waited out. Doors always stop
them, open or shut, so each one stays in its own room.

A movement pattern is simply *which way the enemy turns when something blocks
its path*:

| Pattern | Turns |
| --- | --- |
| vertical | reverses — bounces up and down a column |
| horizontal | reverses — bounces left and right along a row |
| clockwise | 90 degrees clockwise, so it walks a room's perimeter |
| counterclockwise | 90 degrees the other way |

Turning and moving happen in the same step, so a blocked enemy never stalls.

## Music and sound

Every sound in the game — the looping theme, the room tone under it, and each
sound effect — is a **plain text score** in `src/audio/scores/`, played by a
small Web Audio synthesiser. There are no audio files. To rewrite the music,
edit `theme.txt`.

```
tempo 104              # quarter notes per minute
loop on                # "off" for a one-shot, like a sound effect

track bass
  voice triangle       # sine | square | triangle | saw | noise
  gain 0.30            # 0..1, this track's level in the mix
  octave 2             # the octave a bare note name means
  env 0.01 0.07 0.55 0.14     # attack, decay, sustain (0..1), release
  | a/4  a/8 -/8  e/4  a/4 |
```

A note is `pitch/duration`:

| Token | Meaning |
| --- | --- |
| `c` `f#` `eb5` | a note — letter, optional `#`/`b`, optional octave |
| `-` | a rest |
| `~` | a tie: lengthens the note before it |
| `x` | a percussion hit, on a `noise` track |
| `/4` `/8.` | note value — 1, 2, 4, 8, 16 or 32, with `.` to dot it |
| *no duration* | reuse the previous one |
| `\|` | a bar line, ignored — it is there so you can read the file |
| `#` | starts a comment |

Tracks in a score play together and loop together, so give each the same number
of bars. `src/audio/score.js` documents the format in full, and the test suite
checks that every shipped score parses and that the looping ones line up.

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

### Tests

```bash
npm test          # once
npm run test:watch
```

[Vitest](https://vitest.dev/), running in plain Node — three.js builds its
geometry happily without a canvas, and nothing under test imports `main.js`.

Fixtures are **miniature levels**: a handful of legend characters, just large
enough to isolate one rule or the meeting of two. A failing test should tell you
the whole story of the level it ran on.

```js
const game = makeGame(['#####', '#@gG*#', '#####']);
step(game, 1, 0);   // onto the key
step(game, 1, 0);   // through the door it opens
```

`test/helpers/level.js` has the builders. Two things to know:

- Move the player with `step()`, not `player.tryMove()`. Pickups, switches and
  the goal fire when a step *lands*, inside `player.update()`, so a test that
  calls `tryMove` and asserts on the next line will always fail.
- `step()` is one deliberate tile. To test a *held* direction, use
  `player.press(dx, dz)` / `player.release(dx, dz)` and pump frames yourself with
  `advance()`: the player keeps walking on its own, so `step()` would never return.
- `advance(game, seconds)` pumps `tickWorld` — the same function the render loop
  calls — so tests and the game cannot drift apart. Pass
  `makeGame(rows, { enemies: { interval: 1, phase: 0 } })` to give patrols a
  pacing a test can reason about.

Two suites are about the game rather than a rule: `test/levels.test.js` runs the
authoring checks over every stage in `src/levels.js`, and `test/campaign.test.js`
drives the title → stages → win flow straight through `Campaign`, which is why that
class knows nothing about the DOM.

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
| `index.html` | Page shell, canvas, hint, HUD, mute button, D-pad and overlay markup/styles. |
| `src/main.js` | Renderer, scene, camera, lights, wiring, stage loading, and the render loop. |
| `src/world.js` | One simulation step: update order and the collision check, shared with the tests. |
| `src/levels.js` | The stages: rows of legend characters, and nothing else. |
| `src/campaign.js` | Which stage you are on and what happens next: title, playing, clear, dead, complete. |
| `src/tilemap.js` | One loaded stage: tile meshes and all the level rules. |
| `src/player.js` | Movement, held directions, facing and the walk cycle. |
| `src/player-rig.js` | The player's body: head, torso, arms and legs. |
| `src/enemy.js` | Patrolling enemies, their shapes, turn rules and timers. |
| `src/inventory.js` | What the player is carrying. |
| `src/particles.js` | Pooled star sparks for pickups. |
| `src/audio/score.js` | The text score format and its parser. |
| `src/audio/synth.js` | Web Audio voices and the lookahead scheduler. |
| `src/audio/index.js` | Starting sound, playing effects, muting. |
| `src/audio/scores/` | The music and sound effects, as text. |
| `src/hud.js` | The inventory bar and the stage label at the top of the screen. |
| `src/input.js` | Keys → held grid directions, and mute. |
| `src/touch-controls.js` | On-screen D-pad for touch devices, pressed and released the same way. |
| `src/camera-follow.js` | Overhead camera that follows the player. |
| `src/dispose.js` | Hands a stage's geometries and materials back when it is unloaded. |
| `test/` | Vitest suite, built on miniature levels. |
| `vite.config.js` | Pages base path, and the test runner's config. |

## Making it your own

- **Add or redesign a stage:** edit `src/levels.js`. Each stage is a
  `{ id, name, hint, rows }` entry, and `rows` is a grid of characters, documented
  by the `LEGEND` in `src/tilemap.js`:

  ```
  #  wall          .  floor        ~  water       @  player spawn
  *  star (goal)   O  inner tube   i  ice

  '  floor one level up      "  floor two levels up
  /  stair    \  slide (a chute)

  g v w   keys  — gold, violet, white
  G V W   doors — gold, violet, white

  1 2 3   switches that start up   — red, cyan, pink
  4 5 6   switches that start down — red, cyan, pink (1 pairs with 4, 2 with 5...)
  X Y Z   columns that start RAISED    — red, cyan, pink
  x y z   columns that start RETRACTED — red, cyan, pink

  | -     enemy patrolling vertically / horizontally
  ) (     enemy turning clockwise / counterclockwise when blocked
  ```

  Uppercase is the thing that blocks you, lowercase its unblocked partner. A
  switch swaps the two groups of its colour, so pair `X` with `x` to make one
  press open a path and close another.

  Two things to watch when placing switches. A colour with only one switch is
  one-way: after that press it is spent. And never put a switch behind a column
  of its own colour — pressing it can raise the only way out, with nothing left
  to lower it again. The test suite checks the shipped level for exactly that.
- **Recolour the items:** `KEY_COLORS` and `SWITCH_COLORS` in `src/tilemap.js`
  drive both the 3D meshes and the HUD icons.
- **Rebuild the player:** the body is assembled in `src/player-rig.js`; the walk
  cycle and turning live in `src/player.js`.
- **Rewrite the music:** edit `src/audio/scores/theme.txt`. See
  [Music and sound](#music-and-sound).
- **Retune the patrols:** `INTERVALS` and `PHASES` in `src/enemy.js` set how
  often each enemy steps and where in its cycle it starts.
- **Adjust the camera:** `offset` sets the angle and `smoothTime` how tightly it
  follows, both in `src/camera-follow.js`. It deliberately never rotates.
