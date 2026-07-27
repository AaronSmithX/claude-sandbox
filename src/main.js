import * as THREE from 'three';
import { TileMap, KEY_COLORS } from './tilemap.js';
import { STAGES } from './levels.js';
import { Campaign } from './campaign.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { Enemies } from './enemy.js';
import { Inventory } from './inventory.js';
import { setupHud } from './hud.js';
import { setupInput } from './input.js';
import { setupTouchControls, detectTouch } from './touch-controls.js';
import { CameraFollow } from './camera-follow.js';
import { tickWorld } from './world.js';
import { createAudio, onFirstGesture } from './audio/index.js';

const app = document.getElementById('app');

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
// The player, the inventory, the sparks and the camera are built once and carried
// from stage to stage: the camera follows the player's mesh and the input is bound
// to the player, so swapping the instance would strand both. The tilemap and the
// enemies belong to one stage and are rebuilt for the next.
const inventory = new Inventory();
const particles = new Particles();
scene.add(particles.points);

let tilemap = new TileMap(STAGES[0].rows);
scene.add(tilemap.group);

const player = new Player(tilemap, inventory);
scene.add(player.mesh);

let enemies = new Enemies(tilemap);
scene.add(enemies.group);

const cameraFollow = new CameraFollow(camera, player.mesh, {
  groundY: () => player.elevation,
});

// The simulation itself lives in world.js so the tests can drive exactly what
// ships; this object is mutated in place as stages come and go, so the render loop
// below never has to know a stage changed.
const world = { tilemap, player, enemies, inventory, particles };

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
setupInput(player, { onMute: toggleMute, onRetry: retryStage, enabled: canPlay });
setupTouchControls(player, { enabled: canPlay });
detectTouch();

const hintText = document.getElementById('hint-text');
player.onFirstMove = () => document.body.classList.add('has-moved');
player.onStep = () => audio.sfx('footstep');
player.onSlideStart = () => audio.sfx('slide');

// --- Overlays ---------------------------------------------------------------
const overlays = {
  title: document.getElementById('title'),
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
const campaign = new Campaign(STAGES);

/**
 * Swaps in a stage: the old tilemap and enemies go, meshes and all, and the parts
 * that outlive a stage are pointed at the new map and reset.
 */
function loadStage(stage) {
  scene.remove(tilemap.group);
  tilemap.dispose();
  scene.remove(enemies.group);
  enemies.dispose();

  tilemap = new TileMap(stage.rows);
  scene.add(tilemap.group);
  enemies = new Enemies(tilemap);
  scene.add(enemies.group);

  tilemap.onWin = () => campaign.completeStage();
  tilemap.onEvent = onTileEvent;

  world.tilemap = tilemap;
  world.enemies = enemies;

  inventory.reset();
  particles.reset();
  player.setTilemap(tilemap);
  cameraFollow.snap();

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
 * R, or the button on the game-over panel. Deliberately does nothing on the title
 * and end-of-game panels: there is no stage in play there to restart.
 */
function retryStage() {
  if (campaign.phase === 'title' || campaign.phase === 'complete') return;
  campaign.retry();
}

campaign.onPhase = (phase, stage) => {
  showOverlay(phase);

  if (phase === 'playing') {
    loadStage(stage);
    audio.restoreMusic();
    return;
  }

  // Everything else is a panel over a stage that has stopped mattering.
  player.releaseAll();
  audio.duckMusic();

  if (phase === 'stage-clear') {
    if (stageClearName) stageClearName.textContent = `${stage.name} — cleared.`;
    audio.sfx('win');
  }
  if (phase === 'complete') audio.sfx('win');
  if (phase === 'dead') audio.sfx('death');
};

document.getElementById('start')?.addEventListener('click', () => campaign.start());
document.getElementById('next-stage')?.addEventListener('click', () => campaign.next());
document.getElementById('play-again')?.addEventListener('click', () => campaign.restart());
document.getElementById('try-again')?.addEventListener('click', () => campaign.retry());

// The button on a panel is also whatever key is nearest to hand: a panel is a
// pause, and pausing should not send anyone hunting for the mouse.
window.addEventListener('keydown', (e) => {
  if (campaign.isPlaying || e.repeat) return;
  // R stays with the input module, which routes it to retryStage() — it means the
  // same thing on the game-over panel as it does mid-stage.
  if (e.code !== 'Enter' && e.code !== 'Space') return;
  e.preventDefault();

  if (campaign.phase === 'title') campaign.start();
  else if (campaign.phase === 'stage-clear') campaign.next();
  else if (campaign.phase === 'dead') campaign.retry();
  else if (campaign.phase === 'complete') campaign.restart();
});

// The controls hint belongs to a stage in play, not to the title screen behind it;
// loading a stage is what brings it back.
document.body.classList.add('has-moved');
showOverlay(campaign.phase);
hud.setStage({
  tilemap,
  name: campaign.stage.name,
  index: campaign.index,
  total: campaign.total,
});

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
  // The world keeps animating behind a panel — tweens settle, pickups bob — but
  // only a stage in play can advance the game.
  const events = tickWorld(world, dt);
  if (events.died) campaign.die();
  cameraFollow.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
