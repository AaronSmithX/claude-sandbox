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
- **Escape**, or the door button in the top right — leave the stage for the level
  list. It asks first, since a stage you are halfway through is worth a
  confirmation; Escape again is the way to say no. Elsewhere it steps back one
  screen.
- **Enter** or **Space** — the button on whichever panel is up: start, next stage,
  retry, back to levels. Not on the level list or the exit prompt, where the answer
  is whichever button you pick.
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

The game is a short run of stages: eight that each introduce one thing, then the
original single level as the finale with everything on it at once.

The title screen leads to the level list, which is where a stage is chosen. Only the
first is open to begin with — the rest sit behind a padlock, under a row of question
marks, and each one opens as the stage before it is cleared. A cleared stage keeps a
star beside its name and can be replayed from the list at any point.

| Stage | What it is for |
| --- | --- |
| **First Steps** | Walking, and holding a direction to keep walking. |
| **Lock and Key** | Two keys, two doors, in an order that cannot be skipped. |
| **Thin Ice** | Three ice runs, the last of which delivers you onto the star. |
| **Up and Over** | A stair up, a walkway round, and a chute down into the star's pen. |
| **Over and Under** | A bridge over a river, and the same river swum underneath it. |
| **Going Up** | An elevator, and the waiting that comes with one. |
| **Heavy Lifting** | A crate, the plate it has to end up on, and the gate that opens. |
| **Two Places at Once** | Teleport pads, used in both directions to fetch a key. |
| **The Gauntlet** | The 16x16 original: every mechanic, and patrols. |

Clearing a stage pauses on a panel; the last one ends the game. Dying restarts the
stage rather than the run, and **R** restarts it whenever you like. Clearing is also
what unlocks the next stage, and that is remembered in local storage under
`tile-runner:progress:v1` — as a list of stage ids, so reordering the run cannot hand
someone else's progress to the wrong level. **Escape** leaves for the level list at
any point, and a stage abandoned that way stays uncleared.

A stage exists only while one is being played. The title screen, the level list and
the win panel are screens in their own right, with nothing behind them: no map is
built, and `Campaign.hasStage` is what the shell reads to decide. The panels that end
a stage — cleared, game over, and the prompt asking whether to leave — do keep it on
screen, since you want to see where you died and "Keep playing" has to hand that exact
stage back. `src/stage-scene.js` owns the loading and unloading, so what a stage
builds and what it merely borrows (the player, the sparks) is stated in one place.

Stages live in `src/levels.js` as rows of legend characters — content only. Adding
one is a data change: a `{ id, name, hint, rows }` entry, plus an `upper` array of
further grids if it needs a deck over something. The [level
editor](#the-level-editor) writes that entry for you and registers it, so a new stage
need not be typed into the file by hand; either way `test/levels.test.js` holds the new
map to the same checks as the rest (one spawn, a reachable star, a key for every door,
no switch that can seal you in).

The characters are a *dialect*, not the vocabulary. What a mechanic actually claims is
a name — `key:gold`, `switch:red/pressed`, `floor:2` — and `src/glyphs.js` binds the
characters most stages use to the names they mean. A stage can bind its own on top of
that, so nothing is capped at however many punctuation marks are still free.

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
| **Bridges** | A deck one level up, in the same square as whatever it crosses. Walk over the top, or go underneath — the water below is still water. |
| **Elevators** | A platform that runs between the floors beside it on its own clock. It pauses at each end long enough to step on and off, and joins nothing at all while it is moving. |
| **Crates** | Push one by walking into it. It goes one tile, away from you, and never comes back towards you — so a crate shoved into a corner stays there. |
| **Plates** (red, cyan, pink) | Held down by anything standing on it: you, or a crate. |
| **Gates** | Open for exactly as long as a plate of their colour is held. A crate on the plate is what lets you be somewhere else. |
| **Teleport pads** | Pale tiles with a coloured outline, in pairs. Step on one and you arrive at the other; step off and back on to come back. |
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

Floors can sit higher up, **a whole tile per level** — a storey is as tall as a square
is wide, which is what makes a deck something you can be *under* rather than something
you wade through. Two tiles at different heights are
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

### Layers

Height on its own cannot make a bridge: a deck has to be *over* something that is
still there. So a map can be several grids deep, ground first, and a cell can hold
more than one tile — a river on the ground layer and a span above it.

Which tile a step lands on is decided by the height you set out from, and since two
tiles in one cell are never at the same height, that is never a guess. Walk the deck
at level 1 and the water beneath is somebody else's problem; swim it at level 0 and
the deck passes overhead. A patrol underneath cannot catch you on the span.

The clearance is deliberate arithmetic: a walker is 0.9 tall, the walk bob lifts it
0.05 at the top of a stride, and a storey is 1.0 — so a deck is 0.05 thick and a player
passes beneath one without ever wearing it as a hat. Walls grow too, standing 0.6 above
the highest ground beside them, or a plateau would come out flush with the wall meant
to be holding it in.

An **elevator** is the other half of the idea: ground whose height moves. It reads
the floors around it to learn which storeys it serves, then runs between them on a
four-second cycle — dwell, rise, dwell, fall. While it is moving it is joined to
nothing, so you can neither board it nor step off; while it is parked it is simply
floor at that storey. Standing on one carries you, and the camera goes up with you.

### Crates, plates and gates

A crate moves one tile per shove, in the direction you walked, and only if the tile
beyond it will take one — floor, ice, a plate, or a doorway that is already open.
Nothing a crate lands on can be triggered or spent by it: no keys collected, no
switches held down for ever, no stars sat on. On ice a shoved crate keeps going, the
same way you do.

Crates are never pulled, so a crate can be put somewhere it cannot come back from.
That is the puzzle — **R** restarts the stage, and is meant to be used.

A **plate** is held down by whatever stands on it, and its **gate** is open for
exactly as long as one of its plates is held. That is the whole mechanic: you cannot
hold a plate down and be at the gate at the same time, so something else has to do
the holding. Standing in a gateway also holds that gate open, so letting go of the
last plate can never shut a gate on you. Patrols treat a gate like a door — closed
either way — and a crate like a wall.

### Teleport pads

Pads come in pairs — two tiles wearing the same colour — and stepping onto either one
puts you down on the other. The pad you *arrive* on will not send you back until you
step off it and on again, so a pair is a door you can go through twice rather than a
loop with no way out.

A pad ends whatever was happening: a slide stops there rather than carrying you
through, and the camera is put where you now are instead of sweeping the level to
catch up. Crates cannot be pushed onto a pad, and patrols walk over one as though it
were the floor it looks like.

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
| `[c e g]/2` | a chord: those notes struck together, for one note's worth of time |
| `-` | a rest |
| `~` | a tie: lengthens the note before it — every voice of a chord, not just one |
| `x` | a percussion hit, on a `noise` track |
| `/4` `/8.` | note value — 1, 2, 4, 8, 16 or 32, with `.` to dot it |
| *no duration* | reuse the previous one |
| `\|` | a bar line, ignored — it is there so you can read the file |
| `#` | starts a comment, on its own or after a space — `c#5` is a note |

A track plays one note at a time, so a chord needs the brackets; without them
`c/2 e/2 g/2` is an arpeggio that takes three times as long.

Tracks in a score play together and loop together, so give each the same number
of bars. `src/audio/score.js` documents the format in full.
`src/audio/score-checks.js` is what holds a score to it — a seamless loop, bar
lines that add up, gains that leave the master some headroom, nothing shrill —
and both the test suite and the music editor run it, so a score the editor is
happy with is one CI will be happy with.

Bar lines are decoration to the parser: it never counts them, which is exactly
why the check that counts them exists.

## Local development

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173/claude-sandbox/).

### The level editor

There is a second page beside the game, at
http://localhost:5173/claude-sandbox/editor.html. The level's text is on the left and
the level itself is on the right, rebuilt a quarter of a second after you stop typing.

- **The grid box** is one character per tile. A line of `---` starts another layer,
  ground first, which is how a bridge gets a deck over its water. Upper layers are
  padded out with spaces for you, so only the deck has to be typed.
- **The legend box** binds characters this stage wants for itself, one `k = key:rust`
  per line. `//` starts a comment.
- **The panel underneath** lists what is wrong. Some of it is the parser — a ragged
  row, a character that is not in the legend, a chute that bends. The rest is
  `src/level-checks.js`, which asks whether the level can be *finished*: one spawn, a
  star you can walk to, a key for every door, no switch that seals you in. It is the
  same code the test suite holds the shipped stages to, so a level the editor is happy
  with is a level CI will be happy with.
- **Play** walks the level with the real simulation — the same `tickWorld` the game
  runs. Escape stops. In look mode the mouse orbits and scrolls to zoom.
- **The dropdown** is where a draft comes from: **New stage** for a small blank level
  that already walks, or any stage on disk to start from one that exists. Either way it
  asks first if the boxes hold anything unsaved.
- **Save** writes the stage into `src/levels.js` under the id in the box — replacing
  the declaration already there, or adding one and putting it at the end of `STAGES` if
  there is none. The paragraph above an existing stage is left alone; only the `const`
  itself is rewritten, so the prose about what the stage teaches survives being edited
  from the browser. A map the tile parser refuses is not written at all, and the toast
  says why; a map that parses but still fails a check is written, and the toast says
  that too.
- **Discard** throws away the draft in the boxes. If its id is a stage that exists on
  disk it goes back to that stage; otherwise it goes back to a blank one. This is the
  way out of a local draft you no longer want — the boxes otherwise survive a reload,
  which is usually what you want and occasionally exactly not.
- Renaming the `id` and saving **adds** a stage rather than renaming one: the editor
  cannot tell that apart from authoring a new map, so it leaves the old declaration for
  you to delete.

**Making a new level, start to finish:** pick *New stage*, draw it in the grid box,
give it an `id`, `name` and `hint`, and press Save. That is the whole loop — it is
declared in `src/levels.js`, added to `STAGES`, and playable in the game on the next
reload, with no hand-editing at all. `test/levels.test.js` picks it up on its own and
holds it to the same checks as every shipped stage, so a level the editor is happy with
is one CI will be happy with. *New stage* hands out a fresh id each time
(`new-stage`, then `new-stage-2`, …) so a second new level cannot overwrite the first.

Removing a stage, reordering the run, and writing the paragraph above a stage are still
hand edits to `src/levels.js` — they are prose and ordering decisions, and the editor
has nothing useful to say about either.

Save needs `npm run dev` to be what is serving the page — the dev server carries a
small endpoint for it and the built site does not, and there the button falls back to
putting the `const` on the clipboard. Writing `src/levels.js` reloads the page, since
the editor imports it; the draft and the toast both survive that.

### The music editor

A third page, at http://localhost:5173/claude-sandbox/audio-editor.html. The score is
on the left and a piano roll of it is on the right, redrawn a quarter of a second
after you stop typing.

- **Play** starts it; space does the same, unless the caret is in a box. An edit while
  it is playing does not send it back to the top — the new notes are taken up from
  where the old ones had got to, so a change is heard as the music carrying on.
- **The roll** puts time across and pitch up, with every track sharing one pitch axis
  so you can see harmony line up between them. Noise tracks get a strip along the
  bottom. Clicking a note puts the caret on it in the text.
- **M and S** on each track mute and solo it. Nothing restarts: the synth only queues
  about a sixth of a second ahead, so it takes effect within a beat.
- **The panel** is the parser first — it names the line it gave up on — and
  `src/audio/score-checks.js` underneath.
- **Save** writes `src/audio/scores/<name>.txt`, if `npm run dev` is what is serving the
  page: the dev server carries a small endpoint for it, the built site does not, and
  there the button falls back to the clipboard. A first visit opens on a demo score
  named `new-score`, so an exploratory Save cannot land on the game's theme.
- **Discard** throws away the draft in the box. If its name is a score that exists on
  disk it goes back to that score; otherwise it goes back to the demo. The dropdown
  opens any shipped score to start from, and the draft otherwise survives a reload.

To produce a production build in `dist/`:

```bash
npm run build
npm run preview   # serve the built files locally
```

### Tests and types

```bash
npm test          # once
npm run test:watch
npm run typecheck # types, from the JSDoc
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

Four suites are about the game rather than a rule. `test/levels.test.js` runs the
authoring checks over every stage in `src/levels.js`. `test/campaign.test.js` drives
the title → levels → stages → win flow straight through `Campaign` — what the level
list shows, what leaving a stage does, and which screens have one behind them.
`test/progress.test.js` covers saving over a fake store, junk under the key included.
And `test/stage-swap.test.js` covers a stage arriving and leaving: the meshes handed
back, the root left empty, and the player carried across untouched. `Campaign` and
`Progress` knowing nothing about the DOM is what makes the first three possible;
`main.js` needs WebGL and is not imported by any of them, which is why the load and
unload logic lives in `src/stage-scene.js` where it can be tested.

### Types

The game is plain JavaScript and stays that way. `npm run typecheck` runs `tsc` over
it with `checkJs`, so the JSDoc that documents the code is also enforced by it — a
misspelled field is an error rather than an `undefined` that quietly does nothing.
Nothing is emitted and Vite never runs it, so the build is untouched; the shapes that
are hard to infer (a tile, a stage, the world handed to `tickWorld`) are written down
in `src/types.js`.

`tsconfig.json` covers `src/` strictly. `tsconfig.tests.json` covers the suite with
`strictNullChecks` off: a test's business is reaching into a fixture it authored two
lines above, and making each of those prove the tile exists would bury what the test
is saying. Both run in CI, and together they take about a fifth of a second.

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
| `index.html` | Page shell, canvas, hint, HUD, mute and exit buttons, D-pad and overlay markup/styles. |
| `src/main.js` | Renderer, scene, camera, lights, wiring, stage loading, and the render loop. |
| `src/world.js` | One simulation step: update order and the collision check, shared with the tests. |
| `src/levels.js` | The stages: rows of legend characters, and nothing else — plus a `legend` of its own, for a stage that wants one. |
| `src/campaign.js` | Which stage you are on and what happens next: title, levels, playing, clear, dead, complete — which levels are open, and whether there is a stage at all. |
| `src/stage-scene.js` | Everything one stage puts on the screen, built together and thrown away together. |
| `src/progress.js` | What has been cleared, saved to local storage and read back. |
| `src/level-select.js` | The level list's rows: padlocks, question marks and stars. |
| `src/tilemap.js` | One loaded stage: tile meshes, layers, heights and all the level rules. `LEGEND` here is the vocabulary — every kind of tile there is, by name. |
| `src/glyphs.js` | The default dialect: which character means which tile, before a stage says otherwise. |
| `src/player.js` | Movement, held directions, facing and the walk cycle. |
| `src/player-rig.js` | The player's body: head, torso, arms and legs. |
| `src/enemy.js` | Patrolling enemies, their shapes, turn rules and timers. |
| `src/inventory.js` | What the player is carrying. |
| `src/blocks.js` | Pushable crates: where they are, and what a shove may do. |
| `src/particles.js` | Pooled star sparks for pickups. |
| `src/audio/score.js` | The text score format and its parser. |
| `src/audio/synth.js` | Web Audio voices and the lookahead scheduler. |
| `src/audio/index.js` | Starting sound, playing effects, muting. |
| `src/audio/scores/` | The music and sound effects, as text. |
| `src/audio/score-checks.js` | The checks a score has to pass, as data — run by the suite over every score and by the music editor over a draft. |
| `audio-editor.html` | The music editor's page: the score on the left, a piano roll on the right. |
| `src/audio-editor/draft.js` | Parsing for an editor: a complaint rather than a throw, and the score a first visit opens with. |
| `src/audio-editor/save-path.js` | Where the music editor may write, and nowhere else. |
| `src/audio-editor/roll.js` | The piano roll: `layout` is arithmetic and is tested, `paint` draws it. |
| `src/audio-editor/transport.js` | Play, stop, mute and solo, and taking up a changed score where the old one was. |
| `src/audio-editor/main.js` | The music editor's wiring: textarea, debounce, problems panel, save and discard. |
| `src/hud.js` | The inventory bar and the stage label at the top of the screen. |
| `src/input.js` | Keys → held grid directions, plus mute, retry and leaving the stage. Asks for the player each time, because between stages there isn't one. |
| `src/touch-controls.js` | On-screen D-pad for touch devices, pressed and released the same way. |
| `src/camera-follow.js` | Overhead camera that follows the player. |
| `src/dispose.js` | Hands a stage's geometries and materials back when it is unloaded. |
| `src/reach.js` | Flood fill over a parsed map: what can be walked to from the spawn, and which switches can seal you in. |
| `src/level-checks.js` | The checks a stage has to pass, as data — run by the suite over `STAGES` and by the editor over a draft. |
| `editor.html` | The level editor's page: text on the left, preview on the right. |
| `src/editor/draft.js` | The editor's text format, both ways, and the stage literal Save writes. |
| `src/editor/levels-source.js` | Putting a stage back into `src/levels.js`: which declaration to replace, and what to refuse. |
| `src/editor/preview.js` | The editor's viewport: `src/main.js`'s renderer and stage loading, with the campaign left out. |
| `src/editor/main.js` | The editor's wiring: fields, debounce, problems panel, load, save and discard. |
| `test/` | Vitest suite, built on miniature levels. |
| `src/types.js` | JSDoc shapes shared across the code: a tile, a direction, the world. |
| `vite.config.js` | Pages base path, the three HTML entry points, the test runner's config, and the dev-only endpoints both editors save through. |
| `tsconfig.json` | Type checking for `src/`; `tsconfig.tests.json` for the suite. |

## Making it your own

- **Add or redesign a stage:** edit `src/levels.js`, or draw it in the [level
  editor](#the-level-editor), which writes it back for you. Each stage is a
  `{ id, name, hint, rows }` entry, and `rows` is a grid of characters. The
  characters most stages use are bound in `src/glyphs.js`:

  ```
  #  wall          .  floor        ~  water       @  player spawn
  *  star (goal)   O  inner tube   i  ice

  '  floor one level up      "  floor two levels up
  /  stair    \  slide (a chute)
  E e  elevator, starting at the top / at the bottom
  B    a pushable crate
  p q r  pressure plates    P Q R  the gate each colour opens
  a b c  teleport pads — each letter used exactly twice, once at each end

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

- **Give a stage a character of its own:** add a `legend` to it. Each character is
  bound to a name from the `LEGEND` in `src/tilemap.js`, which is the real vocabulary —
  a type, narrowed up to twice:

  ```
  type                  what it is      wall, floor, water, ice, stair, slide,
                                        elevator, crate, spawn, star, tube
  type:variant          which one       key:gold, pad:a, plate:red, floor:1
  type:variant/state    how it starts   switch:red/pressed, elevator/top,
                                        obstacle:red/retracted
  ```

  ```js
  const DEEP_WATER = {
    id: 'deep-water',
    legend: { k: 'key:rust', K: 'door:rust', '^': 'floor:4' },
    rows: [ /* ... */ ],
  };
  ```

  A stage's legend is merged over the dialect, so `{ '.': 'water' }` floods that one
  stage and no other. Two stages may use `k` for two different things. A value can also
  be a def written out in full — `{ T: { type: 'floor', enemy: 'clockwise' } }` — for a
  one-off with no name.

- **Add a colour:** add it to `KEY_COLORS`, `SWITCH_COLORS` or `PAD_COLORS` in
  `src/tilemap.js`. The names follow on their own — a new switch colour brings
  `switch:`, `plate:`, `gate:` and both `obstacle:` states with it — and then a stage
  binds whatever characters it wants for them.

  Two things to watch when placing switches. A colour with only one switch is
  one-way: after that press it is spent. And never put a switch behind a column
  of its own colour — pressing it can raise the only way out, with nothing left
  to lower it again. The test suite checks the shipped level for exactly that.
- **Recolour the items:** `KEY_COLORS` and `SWITCH_COLORS` in `src/tilemap.js`
  drive both the 3D meshes and the HUD icons.
- **Rebuild the player:** the body is assembled in `src/player-rig.js`; the walk
  cycle and turning live in `src/player.js`.
- **Rewrite the music:** edit `src/audio/scores/theme.txt`, or open the [music
  editor](#the-music-editor) and hear it as you go. See
  [Music and sound](#music-and-sound).
- **Retune the patrols:** `INTERVALS` and `PHASES` in `src/enemy.js` set how
  often each enemy steps and where in its cycle it starts.
- **Adjust the camera:** `offset` sets the angle and `smoothTime` how tightly it
  follows, both in `src/camera-follow.js`. It deliberately never rotates.
