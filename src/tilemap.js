import * as THREE from 'three';

// Tile type codes used in the MAP grid below.
export const TILE = {
  FLOOR: 0,
  WALL: 1,
  WATER: 2,
};

// The world map. Row = z axis, column = x axis. Edit freely to design levels.
// 1 = wall (blocks movement, tall box), 2 = water (blocks movement, sunken),
// 0 = floor (walkable).
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 2, 2, 0, 0, 1],
  [1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1],
  [1, 2, 2, 0, 1, 0, 0, 0, 1, 1, 0, 1],
  [1, 2, 2, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export const TILE_SIZE = 1;

/**
 * Builds all tile meshes from basic 3D shapes (boxes) and exposes helpers for
 * grid math and walkability checks.
 */
export class TileMap {
  constructor() {
    this.rows = MAP.length;
    this.cols = MAP[0].length;
    this.group = new THREE.Group();
    this._build();
  }

  get(gx, gz) {
    if (gz < 0 || gz >= this.rows || gx < 0 || gx >= this.cols) return null;
    return MAP[gz][gx];
  }

  isWalkable(gx, gz) {
    const t = this.get(gx, gz);
    return t === TILE.FLOOR;
  }

  // Convert grid coordinates to world-space (tiles centered on the origin).
  gridToWorld(gx, gz) {
    return new THREE.Vector3(
      (gx - (this.cols - 1) / 2) * TILE_SIZE,
      0,
      (gz - (this.rows - 1) / 2) * TILE_SIZE,
    );
  }

  // A sensible walkable starting tile for the player.
  findSpawn() {
    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.isWalkable(x, z)) return { gx: x, gz: z };
      }
    }
    return { gx: 1, gz: 1 };
  }

  _build() {
    const floorGeo = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.2, TILE_SIZE * 0.98);
    const wallGeo = new THREE.BoxGeometry(TILE_SIZE, 1.0, TILE_SIZE);
    const waterGeo = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.12, TILE_SIZE * 0.98);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.9 });
    const floorMatAlt = new THREE.MeshStandardMaterial({ color: 0x356a42, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.8 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2b6fb0,
      roughness: 0.3,
      metalness: 0.1,
    });

    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const type = MAP[z][x];
        const world = this.gridToWorld(x, z);
        let mesh;

        if (type === TILE.WALL) {
          mesh = new THREE.Mesh(wallGeo, wallMat);
          mesh.position.set(world.x, 0.5, world.z);
        } else if (type === TILE.WATER) {
          mesh = new THREE.Mesh(waterGeo, waterMat);
          mesh.position.set(world.x, -0.15, world.z);
        } else {
          // Checkerboard tint so the grid reads clearly.
          const mat = (x + z) % 2 === 0 ? floorMat : floorMatAlt;
          mesh = new THREE.Mesh(floorGeo, mat);
          mesh.position.set(world.x, -0.1, world.z);
        }

        mesh.castShadow = type === TILE.WALL;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }
  }
}
