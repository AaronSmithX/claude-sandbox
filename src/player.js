import * as THREE from 'three';
import { buildTube } from './tilemap.js';

const MOVE_DURATION = 0.14; // seconds per tile step

/**
 * The player: a basic cube that lives on the tile grid. Movement snaps
 * tile-to-tile but slides smoothly between tiles for a bit of polish.
 * What it may step onto depends on the inventory it carries.
 */
export class Player {
  constructor(tilemap, inventory) {
    this.tilemap = tilemap;
    this.inventory = inventory;

    // Fired the first time a move actually starts, so the UI can drop the hint.
    this.onFirstMove = null;
    this._hasMoved = false;

    const spawn = tilemap.findSpawn();
    this.gx = spawn.gx;
    this.gz = spawn.gz;

    const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffb347,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0x3a2400,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;

    // The inner tube, once collected, rides around the cube.
    this.tube = buildTube(
      new THREE.MeshStandardMaterial({
        color: 0xff7a45,
        roughness: 0.4,
        metalness: 0.1,
        emissive: 0x662d15,
      }),
    );
    this.tube.position.y = -0.12;
    this.tube.visible = false;
    this.mesh.add(this.tube);

    this.restingHeight = 0.4;

    // Tween state.
    this._moving = false;
    this._t = 0;
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();

    this._snapToGrid();
  }

  get isMoving() {
    return this._moving;
  }

  _snapToGrid() {
    const p = this.tilemap.gridToWorld(this.gx, this.gz);
    this.mesh.position.set(p.x, this.restingHeight, p.z);
  }

  /** Returns the player to the spawn tile with nothing carried. */
  reset() {
    const spawn = this.tilemap.findSpawn();
    this.gx = spawn.gx;
    this.gz = spawn.gz;
    this._moving = false;
    this._t = 0;
    this.tube.visible = false;
    this._snapToGrid();
  }

  /** Attempt to move by one tile in grid space. Ignored mid-move or if blocked. */
  tryMove(dx, dz) {
    if (this._moving || this.inventory.won) return;

    const nx = this.gx + dx;
    const nz = this.gz + dz;
    if (!this.tilemap.canEnter(nx, nz, this.inventory)) return;

    // Doors open on the way in, spending the matching key.
    this.tilemap.openDoor(nx, nz, this.inventory);

    this.gx = nx;
    this.gz = nz;

    this._from.copy(this.mesh.position);
    const target = this.tilemap.gridToWorld(nx, nz);
    this._to.set(target.x, this.restingHeight, target.z);
    this._t = 0;
    this._moving = true;

    if (!this._hasMoved) {
      this._hasMoved = true;
      this.onFirstMove?.();
    }
  }

  update(dt) {
    // The tube shows as soon as it is picked up, and rotates gently.
    this.tube.visible = this.inventory.hasTube;
    if (this.tube.visible) this.tube.rotation.z += dt * 0.8;

    if (!this._moving) return;

    this._t += dt / MOVE_DURATION;
    if (this._t >= 1) {
      this._t = 1;
      this._moving = false;
    }

    // Smoothstep easing for the horizontal slide.
    const e = this._t * this._t * (3 - 2 * this._t);
    this.mesh.position.lerpVectors(this._from, this._to, e);

    // A little hop arc while moving.
    const hop = Math.sin(Math.PI * this._t) * 0.18;
    this.mesh.position.y = this.restingHeight + hop;

    // Arriving on the tile is what triggers pickups, switches and the goal.
    if (!this._moving) {
      this.tilemap.onEnter(this.gx, this.gz, this.inventory);
    }
  }
}
