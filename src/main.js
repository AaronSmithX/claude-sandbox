import * as THREE from 'three';
import { KEY_COLORS, PAD_COLORS } from './tilemap.js';
import { STAGES } from './levels.js';
import { Campaign } from './campaign.js';
import { StageScene } from './stage-scene.js';
import { setupLevelSelect } from './level-select.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { setupHud } from './hud.js';
import { setupInput } from './input.js';
import { setupTouchControls, detectTouch } from './touch-controls.js';
import { CameraFollow } from './camera-follow.js';
import { tickWorld } from './world.js';
import { createAudio, onFirstGesture } from './audio/index.js';

const app = document.getElementById('app');
if (!app) throw new Error('index.html is missing #app to render into');

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene ------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 22, 40);

// --- Camera -----------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);

// --- Lights -----------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
sun.position.set(6, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
scene.add(sun);

// --- The parts that outlive a stage -----------------------------------------
// The inventory, the sparks, the player and the camera are carried from stage to
// stage: the camera follows the player's mesh and the input is bound to the player,
// so swapping the instance would strand both. The map, the enemies and the crates
// belong to one stage and are thrown away with it.
const inventory = new Inventory();
const particles = new Particles();

// A Player needs a map to find its spawn on, so it cannot be built before there is a
// stage. It is made on the first load and then kept for the session; these stay null
// until someone actually plays something.
/** @type {Player | null} */
let player = null;
/** @type {CameraFollow | null} */
let cameraFollow = null;

/**
 * The stage on the screen, or null on the title screen, the level list and the win
 * panel — the three screens that stand on their own.
 * @type {import('./stage-scene.js').StageScene | null}
 */
let loaded = null;

// The simulation itself lives in world.js so the tests can drive exactly what ships.
// Null is the whole point: with no stage there is nothing to simulate, and the render
// loop below reads that rather than being told about it.
/** @type {import('./types.js').World | null} */
let world = null;

// --- Sound ------------------------------------------------------------------
const audio = createAudio();
audio.watchVisibility();
// Browsers will not start an AudioContext without a gesture, so the music waits
// for the player's first key press or tap.
onFirstGesture(() => audio.start());

const muteButton = document.getElementById('mute');

function showMuted(muted) {
  document.body.classList.toggle('is-muted', muted);
  muteButton?.setAttribute('aria-pressed', String(muted));
  muteButton?.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}

function toggleMute() {
  showMuted(audio.toggleMuted());
}

showMuted(audio.muted);
muteButton?.addEventListener('click', toggleMute);

// --- HUD and controls -------------------------------------------------------
const hud = setupHud(inventory);
const canPlay = () => campaign.isPlaying;
// Bound now, though there is nobody to move yet: M and Escape belong to the title
// screen as much as to a stage, so the keys go on at start-up and ask for the player
// each time rather than being handed one.
const currentPlayer = () => player;
setupInput(currentPlayer, {
  onMute: toggleMute,
  onRetry: () => campaign.retry(),
  onExit: exitKey,
  enabled: canPlay,
});
setupTouchControls(currentPlayer, { enabled: canPlay });
detectTouch();

const hintText = document.getElementById('hint-text');

// --- Overlays ---------------------------------------------------------------
const overlays = {
  title: document.getElementById('title'),
  levels: document.getElementById('levels'),
  'confirm-exit': document.getElementById('confirm-exit'),
  'stage-clear': document.getElementById('stage-clear'),
  complete: document.getElementById('win'),
  dead: document.getElementById('gameover'),
  playing: null,
};
const stageClearName = document.getElementById('stage-clear-name');

function showOverlay(phase) {
  for (const [name, element] of Object.entries(overlays)) {
    element?.classList.toggle('is-shown', name === phase);
  }
  // The exit button belongs to a stage in play, and to nothing else. The stage label,
  // the inventory bar and the controls hint belong to a stage that is on the screen,
  // which lasts a little longer — through the panels that end one.
  document.body.classList.toggle('is-playing', phase === 'playing');
  document.body.classList.toggle('has-stage', campaign.hasStage);
}

// --- Effects ----------------------------------------------------------------
// The colour a burst takes, so a spark shower reads as the thing collected.
const PICKUP_COLORS = {
  key: (color) => KEY_COLORS[color],
  tube: () => 0xff7a45,
  star: () => 0xffe066,
};

function onTileEvent(name, detail) {
  audio.sfx(name);

  // A pad announces both of its ends, so the sparks say where you went as well as
  // where you were.
  if (name === 'teleport') {
    particles.burst(detail.position.setY(0.4), {
      color: PAD_COLORS[detail.color ?? 'a'],
      count: 12,
      rise: 2.2,
    });
    return;
  }

  if (name !== 'pickup') return;
  const color = PICKUP_COLORS[detail.kind]?.(detail.color) ?? 0xffffff;
  // Burst at chest height rather than at the floor, where the item was.
  const isStar = detail.kind === 'star';
  particles.burst(detail.position.setY(0.5), {
    color,
    count: isStar ? 16 : 9,
    rise: isStar ? 3.2 : 2.5,
  });
}

// --- Stages -----------------------------------------------------------------
// The campaign reads what has been cleared out of local storage, so the level list
// opens where the last visit left it.
const campaign = new Campaign(STAGES);
const levelSelect = setupLevelSelect({ onSelect: (index) => campaign.selectStage(index) });

/**
 * Builds a stage and puts it on the screen. Whatever was there goes first, so this is
 * also how a retry works: the same stage, from nothing.
 *
 * @param {import('./levels.js').Stage} stage
 */
function loadStage(stage) {
  unloadStage();

  // Everything the stage puts on the screen hangs off its own root, and nothing else
  // does — the lights and the camera are the scene's own. That one group going in and
  // coming out is the whole of a stage arriving and leaving.
  loaded = new StageScene(stage);
  scene.add(loaded.root);

  // The first stage of the session is the first time there is a map to spawn on, and
  // so the first time there can be a player at all. Everything bound to that player
  // is bound here, once, and outlives every stage after it.
  if (!player) {
    const first = new Player(loaded.tilemap, inventory);
    player = first;
    cameraFollow = new CameraFollow(camera, first.mesh, {
      groundY: () => first.elevation,
    });

    first.onFirstMove = () => document.body.classList.add('has-moved');
    first.onStep = () => audio.sfx('footstep');
    first.onSlideStart = () => audio.sfx('slide');
    first.onPush = () => audio.sfx('switch');
    // A warp is not a walk: the camera is put where the player now is, rather than
    // sweeping the level to catch up.
    first.onTeleport = () => cameraFollow?.snap();
  } else {
    player.setTilemap(loaded.tilemap);
  }

  // Visiting, not owned: both are parented to the stage so that unloading it takes
  // them off the screen, and both are still here for the next one.
  const active = player;
  const { tilemap, blocks } = loaded;
  loaded.root.add(active.mesh, particles.points);

  // What holds a plate down: whoever is standing on it. The map asks rather than
  // holding references, so this is the one place the cast is named.
  tilemap.occupants = () => [{ tile: active.tile }, ...blocks.occupants()];
  active.blocks = blocks;

  tilemap.onWin = () => campaign.completeStage();
  tilemap.onEvent = onTileEvent;

  world = {
    tilemap,
    player: active,
    enemies: loaded.enemies,
    inventory,
    particles,
    blocks,
  };

  inventory.reset();
  particles.reset();
  blocks.reset();
  cameraFollow?.snap();

  hud.setStage({
    tilemap,
    name: stage.name,
    index: campaign.index,
    total: campaign.total,
  });

  // Each stage gets its own line of guidance, and each one earns it back: the
  // hint shows again until the player moves.
  if (hintText) hintText.innerHTML = stage.hint;
  document.body.classList.remove('has-moved');
}

/**
 * Takes the stage back off the screen and hands its meshes back. The player and the
 * sparks are only parented to it, so clearing the root returns them to nothing rather
 * than destroying them — they go on to the next stage.
 */
function unloadStage() {
  if (!loaded) return;
  scene.remove(loaded.root);
  loaded.dispose();
  loaded = null;
  world = null;
}

/**
 * Escape, and the button in the corner: one step back, wherever you are. Mid-stage
 * that step asks first; on the prompt it takes the question back; on a panel that
 * has already ended the stage there is nothing left to confirm. The title screen is
 * as far back as it goes.
 */
function exitKey() {
  const phase = campaign.phase;
  if (phase === 'playing') campaign.requestExit();
  else if (phase === 'confirm-exit') campaign.cancelExit();
  else if (phase === 'levels') campaign.showTitle();
  else if (phase !== 'title') campaign.showLevels();
}

campaign.onPhase = (phase, stage, { resumed }) => {
  showOverlay(phase);

  if (phase === 'playing') {
    // Backing out of the exit prompt returns to the stage as it was left; only a
    // stage starting from the top gets rebuilt.
    if (!resumed) loadStage(stage);
    audio.restoreMusic();
    return;
  }

  // Everything else is a panel over a stage that has stopped mattering — or, on
  // the exit prompt, one that is holding its breath.
  player?.releaseAll();
  audio.duckMusic();

  // The title screen, the level list and the win panel are screens in their own
  // right: no stage stands behind them, so the one that was there is handed back.
  if (!campaign.hasStage) unloadStage();

  // Built fresh each time it is shown: a stage cleared since the last visit is a
  // padlock that has to come off.
  if (phase === 'levels') levelSelect.render(campaign.levels());

  if (phase === 'stage-clear') {
    if (stageClearName) stageClearName.textContent = `${stage.name} — cleared.`;
    audio.sfx('win');
  }
  if (phase === 'complete') audio.sfx('win');
  if (phase === 'dead') audio.sfx('death');
};

const onClick = (id, handler) =>
  document.getElementById(id)?.addEventListener('click', handler);

// The title screen leads to the level list rather than straight into a stage: which
// level to play is the player's to choose from the first screen on.
onClick('start', () => campaign.showLevels());
onClick('next-stage', () => campaign.next());
onClick('play-again', () => campaign.showLevels());
onClick('try-again', () => campaign.retry());
onClick('clear-levels', () => campaign.showLevels());
onClick('dead-levels', () => campaign.showLevels());
onClick('levels-title', () => campaign.showTitle());
onClick('exit', exitKey);
onClick('exit-confirm', () => campaign.showLevels());
onClick('exit-cancel', () => campaign.cancelExit());

// The primary button on a panel is also whatever key is nearest to hand: a panel is
// a pause, and pausing should not send anyone hunting for the mouse.
//
// Two screens are left out. The level list has no one primary row, and the exit
// prompt has no one obvious answer — guessing there is exactly what a confirmation
// exists to avoid, so it is answered by its buttons or by Escape.
const PANEL_KEYS = {
  title: () => campaign.showLevels(),
  'stage-clear': () => campaign.next(),
  dead: () => campaign.retry(),
  complete: () => campaign.showLevels(),
};

window.addEventListener('keydown', (e) => {
  if (campaign.isPlaying || e.repeat) return;
  // R stays with the input module, which routes it to campaign.retry() — it means
  // the same thing on the game-over panel as it does mid-stage. Escape likewise.
  if (e.code !== 'Enter' && e.code !== 'Space') return;
  // A focused button already answers both of these for itself; stepping in as well
  // would fire the panel's primary action over the one under the player's finger.
  if (document.activeElement instanceof HTMLButtonElement) return;
  const action = PANEL_KEYS[campaign.phase];
  if (!action) return;
  e.preventDefault();
  action();
});

// The controls hint belongs to a stage in play; loading one is what brings it back.
// Nothing else needs saying up front — the title screen has no stage behind it, so
// there is no map to build, no label to fill in and no inventory to show.
document.body.classList.add('has-moved');
showOverlay(campaign.phase);

// --- Resize handling --------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop ------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // No stage, nothing to simulate. The render still happens, so the canvas clears to
  // the background colour rather than holding the last frame of a stage that is gone.
  if (world) {
    // The world keeps animating behind a panel — tweens settle, pickups bob — but
    // only a stage in play can advance the game.
    //
    // The exit prompt is the exception: that stage is going to be handed back, so it
    // is stopped rather than left running. A patrol that walked onto you while you
    // were deciding would otherwise be waiting the moment you said "keep playing".
    const events = tickWorld(world, campaign.isPaused ? 0 : dt);
    if (events.died) campaign.die();
    cameraFollow?.update(dt);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
