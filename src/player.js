import * as THREE from 'three';

const MOVE_DURATION = 0.14; // seconds per tile step

/**
 * The player: a basic cube that lives on the tile grid. Movement snaps
 * tile-to-tile but slides smoothly between tiles for a bit of polish.
 */
export class Player {
  constructor(tilemap) {
    this.tilemap = tilemap;

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

    const p = tilemap.gridToWorld(this.gx, this.gz);
    this.restingHeight = 0.4;
    this.mesh.position.set(p.x, this.restingHeight, p.z);

    // Tween state.
    this._moving = false;
    this._t = 0;
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
  }

  get isMoving() {
    return this._moving;
  }

  /** Attempt to move by one tile in grid space. Ignored mid-move or into walls. */
  tryMove(dx, dz) {
    if (this._moving) return;

    const nx = this.gx + dx;
    const nz = this.gz + dz;
    if (!this.tilemap.isWalkable(nx, nz)) return;

    this.gx = nx;
    this.gz = nz;

    this._from.copy(this.mesh.position);
    const target = this.tilemap.gridToWorld(nx, nz);
    this._to.set(target.x, this.restingHeight, target.z);
    this._t = 0;
    this._moving = true;
  }

  update(dt) {
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
  }
}
