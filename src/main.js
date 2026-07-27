import * as THREE from 'three';
import { TileMap, KEY_COLORS } from './tilemap.js';
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

// --- World, player & inventory ----------------------------------------------
const tilemap = new TileMap();
scene.add(tilemap.group);

const inventory = new Inventory();
const player = new Player(tilemap, inventory);
scene.add(player.mesh);

const enemies = new Enemies(tilemap);
scene.add(enemies.group);

const particles = new Particles();
scene.add(particles.points);

const cameraFollow = new CameraFollow(camera, player.mesh);

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

setupHud(inventory);
setupInput(player, { onMute: toggleMute });
setupTouchControls(player);
detectTouch();

// The controls hint has done its job once the player starts moving.
player.onFirstMove = () => document.body.classList.add('has-moved');
player.onStep = () => audio.sfx('footstep');
player.onSlideStart = () => audio.sfx('slide');

// --- Overlays ---------------------------------------------------------------
const winOverlay = document.getElementById('win');
const gameOverOverlay = document.getElementById('gameover');

tilemap.onWin = () => {
  winOverlay?.classList.add('is-shown');
  audio.duckMusic();
  audio.sfx('win');
};

// --- Effects ----------------------------------------------------------------
// The colour a burst takes, so a spark shower reads as the thing collected.
const PICKUP_COLORS = {
  key: (color) => KEY_COLORS[color],
  tube: () => 0xff7a45,
  star: () => 0xffe066,
};

tilemap.onEvent = (name, detail) => {
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
};

function restart() {
  winOverlay?.classList.remove('is-shown');
  gameOverOverlay?.classList.remove('is-shown');
  audio.restoreMusic();
  tilemap.reset();
  inventory.reset();
  player.reset();
  enemies.reset();
  particles.reset();
  cameraFollow.snap();
}

document.getElementById('play-again')?.addEventListener('click', restart);
document.getElementById('try-again')?.addEventListener('click', restart);

// --- Resize handling --------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop ------------------------------------------------------------
const clock = new THREE.Clock();

// The simulation itself lives in world.js so the tests can drive exactly what
// ships; this loop only feeds it time and renders the result.
const world = { tilemap, player, enemies, inventory, particles };

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const events = tickWorld(world, dt);
  if (events.died) {
    gameOverOverlay?.classList.add('is-shown');
    audio.duckMusic();
    audio.sfx('death');
  }
  cameraFollow.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
