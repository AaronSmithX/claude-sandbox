import * as THREE from 'three';
import { TileMap } from './tilemap.js';
import { Player } from './player.js';
import { setupInput } from './input.js';
import { CameraFollow } from './camera-follow.js';

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
scene.fog = new THREE.Fog(0x0b1020, 18, 32);

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

// --- World & player ---------------------------------------------------------
const tilemap = new TileMap();
scene.add(tilemap.group);

const player = new Player(tilemap);
scene.add(player.mesh);

const cameraFollow = new CameraFollow(camera, player.mesh);
setupInput(player);

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
  player.update(dt);
  cameraFollow.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
