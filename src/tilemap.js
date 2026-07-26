import * as THREE from 'three';

export const TILE_SIZE = 1;

// Two deliberately separate palettes so a "red" thing is never mistaken for a
// "gold" thing. Keys/doors are one system; switches/obstacles are another.
export const KEY_COLORS = {
  gold: 0xf7c948,
  violet: 0x8b5cf6,
  white: 0xe8edf7,
};

export const SWITCH_COLORS = {
  red: 0xef4444,
  cyan: 0x22d3ee,
  pink: 0xec4899,
};

/**
 * Map legend. Case convention: an uppercase letter is the thing that blocks
 * you, its lowercase partner is the state that doesn't.
 *
 *   #  wall          .  floor         ~  water        @  player spawn
 *   *  star (goal)   O  inner tube (lets you cross water)
 *
 *   g v w   keys  — gold, violet, white
 *   G V W   doors — gold, violet, white (a key opens only its own colour)
 *
 *   1 2 3   switches — red, cyan, pink
 *   X Y Z   obstacle columns that start RAISED    — red, cyan, pink
 *   x y z   obstacle columns that start RETRACTED — red, cyan, pink
 *
 * Obstacles belong to group A (uppercase) or group B (lowercase). Stepping on
 * a switch swaps which group is raised, so one press both opens and closes.
 */
const LEGEND = {
  '#': { type: 'wall' },
  '.': { type: 'floor' },
  '~': { type: 'water' },
  '@': { type: 'spawn' },
  '*': { type: 'star' },
  O: { type: 'tube' },
  g: { type: 'key', color: 'gold' },
  v: { type: 'key', color: 'violet' },
  w: { type: 'key', color: 'white' },
  G: { type: 'door', color: 'gold' },
  V: { type: 'door', color: 'violet' },
  W: { type: 'door', color: 'white' },
  1: { type: 'switch', color: 'red' },
  2: { type: 'switch', color: 'cyan' },
  3: { type: 'switch', color: 'pink' },
  X: { type: 'obstacle', color: 'red', group: 'A' },
  Y: { type: 'obstacle', color: 'cyan', group: 'A' },
  Z: { type: 'obstacle', color: 'pink', group: 'A' },
  x: { type: 'obstacle', color: 'red', group: 'B' },
  y: { type: 'obstacle', color: 'cyan', group: 'B' },
  z: { type: 'obstacle', color: 'pink', group: 'B' },
};

// The level. Nine rooms on a 16x16 grid, chained so every mechanic sits on the
// critical path: gold door -> inner tube -> red switch -> pink switch ->
// white key -> violet door -> cyan switch -> water crossing -> star.
const MAP = [
  '################',
  '#@...#1...#...##',
  '#....G....X..Zw#',
  '#..g.#.O..#...##',
  '#....#x..3#1.z.#',
  '##.#############',
  '#2...#....#....#',
  '#....#~~~~.....#',
  '#....#~~~~#....#',
  '#...v#....#....#',
  '##.####Y####W###',
  '#..y.#....#....#',
  '#....V....#....#',
  '#....#....#..*.#',
  '#....#....#....#',
  '################',
];

// Column heights. Columns are 1.0 tall and centred on the group origin, and the
// floor slab occupies y -0.2..0, so a retracted group must clear -0.2 at the top
// or the tops show through the seams between floor tiles at this camera angle.
const COLUMN_RAISED_Y = 0.5;
const COLUMN_RETRACTED_Y = -0.85;

/**
 * Builds every tile from basic 3D shapes and owns the level's mutable state:
 * which pickups are gone, which doors are open, and which obstacle group is
 * currently raised per colour.
 */
export class TileMap {
  constructor() {
    this.rows = MAP.length;
    this.cols = MAP[0].length;
    this.group = new THREE.Group();
    this.spawn = { gx: 1, gz: 1 };

    // Called with no arguments when the player reaches the star.
    this.onWin = null;

    this._elapsed = 0;
    this._parse();
    this._build();
    this._resetState();
  }

  // --- Map data -------------------------------------------------------------

  _parse() {
    this.tiles = [];
    for (let z = 0; z < this.rows; z++) {
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        const char = MAP[z][x];
        const def = LEGEND[char];
        if (!def) throw new Error(`Unknown map character "${char}" at ${x},${z}`);
        if (def.type === 'spawn') this.spawn = { gx: x, gz: z };
        row.push({ ...def, gx: x, gz: z });
      }
      this.tiles.push(row);
    }
  }

  get(gx, gz) {
    if (gz < 0 || gz >= this.rows || gx < 0 || gx >= this.cols) return null;
    return this.tiles[gz][gx];
  }

  // Convert grid coordinates to world-space (tiles centered on the origin).
  gridToWorld(gx, gz) {
    return new THREE.Vector3(
      (gx - (this.cols - 1) / 2) * TILE_SIZE,
      0,
      (gz - (this.rows - 1) / 2) * TILE_SIZE,
    );
  }

  /** Terrain-only walkability, ignoring anything the player is carrying. */
  isWalkable(gx, gz) {
    const t = this.get(gx, gz);
    if (!t) return false;
    return t.type !== 'wall' && t.type !== 'water' && t.type !== 'door' && t.type !== 'obstacle';
  }

  findSpawn() {
    return { ...this.spawn };
  }

  // --- Rules ----------------------------------------------------------------

  /** True when an obstacle tile's columns are currently up. */
  isRaised(tile) {
    return tile.type === 'obstacle' && tile.group === this.phase[tile.color];
  }

  /** Can the player, carrying `inventory`, step onto this tile? */
  canEnter(gx, gz, inventory) {
    const t = this.get(gx, gz);
    if (!t) return false;

    switch (t.type) {
      case 'wall':
        return false;
      case 'water':
        return inventory.hasTube;
      case 'door':
        return t.open || inventory.keyCount(t.color) > 0;
      case 'obstacle':
        return !this.isRaised(t);
      default:
        return true;
    }
  }

  /**
   * Spends a key to open a closed door. Called before the move starts so the
   * slab is already gone as the player slides in.
   */
  openDoor(gx, gz, inventory) {
    const t = this.get(gx, gz);
    if (!t || t.type !== 'door' || t.open) return false;
    if (!inventory.useKey(t.color)) return false;
    t.open = true;
    if (t.mesh) t.mesh.visible = false;
    return true;
  }

  /** Applies whatever the tile does once the player has arrived on it. */
  onEnter(gx, gz, inventory) {
    const t = this.get(gx, gz);
    if (!t) return;

    switch (t.type) {
      case 'key':
        if (t.taken) return;
        t.taken = true;
        if (t.mesh) t.mesh.visible = false;
        inventory.addKey(t.color);
        break;

      case 'tube':
        if (t.taken) return;
        t.taken = true;
        if (t.mesh) t.mesh.visible = false;
        inventory.setTube(true);
        break;

      case 'switch':
        this.pressSwitch(t);
        break;

      case 'star':
        if (inventory.won) return;
        inventory.setWon(true);
        this.onWin?.();
        break;
    }
  }

  /**
   * Flips which obstacle group of this colour is raised, and makes this the
   * only switch of its colour that reads as pressed.
   */
  pressSwitch(tile) {
    this.phase[tile.color] = this.phase[tile.color] === 'A' ? 'B' : 'A';
    this.pressedSwitch[tile.color] = tile;
  }

  isPressed(tile) {
    return this.pressedSwitch[tile.color] === tile;
  }

  // --- State ----------------------------------------------------------------

  _resetState() {
    // Group A is the one raised at the start of the level.
    this.phase = { red: 'A', cyan: 'A', pink: 'A' };
    this.pressedSwitch = { red: null, cyan: null, pink: null };

    for (const row of this.tiles) {
      for (const t of row) {
        t.taken = false;
        t.open = false;
        if (t.mesh) t.mesh.visible = true;
        if (t.columns) {
          t.columns.position.y = this.isRaised(t) ? COLUMN_RAISED_Y : COLUMN_RETRACTED_Y;
        }
      }
    }
  }

  /** Restores the level to its authored state, for "Play again". */
  reset() {
    this._resetState();
  }

  // --- Per-frame animation --------------------------------------------------

  update(dt) {
    this._elapsed += dt;
    const k = 1 - Math.pow(0.002, dt); // exponential smoothing factor

    for (const row of this.tiles) {
      for (const t of row) {
        if (t.columns) {
          const target = this.isRaised(t) ? COLUMN_RAISED_Y : COLUMN_RETRACTED_Y;
          t.columns.position.y += (target - t.columns.position.y) * k;
        }

        if (t.type === 'switch' && t.mesh) {
          const target = this.isPressed(t) ? 0.0 : 0.05;
          t.mesh.position.y += (target - t.mesh.position.y) * k;
        }

        // Pickups bob so they read as collectable. Spinning happens on an inner
        // group, so a tilted pickup turns about the vertical axis instead of
        // tumbling — a flat torus spun directly would go edge-on and vanish.
        if (t.mesh && t.bobBase !== undefined && !t.taken) {
          t.mesh.position.y = t.bobBase + Math.sin(this._elapsed * 2 + t.gx + t.gz) * 0.08;
          if (t.spinner) t.spinner.rotation.y += dt * 1.4;
        }
      }
    }
  }

  // --- Mesh construction ----------------------------------------------------

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
        const tile = this.tiles[z][x];
        const world = this.gridToWorld(x, z);

        if (tile.type === 'wall') {
          const mesh = new THREE.Mesh(wallGeo, wallMat);
          mesh.position.set(world.x, 0.5, world.z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.group.add(mesh);
          continue;
        }

        if (tile.type === 'water') {
          const mesh = new THREE.Mesh(waterGeo, waterMat);
          mesh.position.set(world.x, -0.15, world.z);
          mesh.receiveShadow = true;
          this.group.add(mesh);
          continue;
        }

        // Every other tile gets a floor underneath, so opening a door or
        // retracting columns reveals ground rather than a hole.
        const mat = (x + z) % 2 === 0 ? floorMat : floorMatAlt;
        const floor = new THREE.Mesh(floorGeo, mat);
        floor.position.set(world.x, -0.1, world.z);
        floor.receiveShadow = true;
        this.group.add(floor);

        const feature = this._buildFeature(tile, world);
        if (feature) this.group.add(feature);
      }
    }
  }

  /** Builds the mesh that sits on top of a tile's floor, if it has one. */
  _buildFeature(tile, world) {
    switch (tile.type) {
      case 'door': {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE, 1.0, TILE_SIZE),
          this._litMaterial(KEY_COLORS[tile.color], 0.35),
        );
        mesh.position.set(world.x, 0.5, world.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        tile.mesh = mesh;
        return mesh;
      }

      case 'obstacle': {
        const columns = new THREE.Group();
        const geo = new THREE.BoxGeometry(0.22, 1.0, 0.22);
        const mat = this._litMaterial(SWITCH_COLORS[tile.color], 0.3);
        for (const [ox, oz] of [
          [-0.2, -0.2],
          [0.2, -0.2],
          [-0.2, 0.2],
          [0.2, 0.2],
        ]) {
          const column = new THREE.Mesh(geo, mat);
          column.position.set(ox, 0, oz);
          column.castShadow = true;
          columns.add(column);
        }
        columns.position.set(world.x, COLUMN_RAISED_Y, world.z);
        tile.columns = columns;
        return columns;
      }

      case 'switch': {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20),
          this._litMaterial(SWITCH_COLORS[tile.color], 0.45),
        );
        mesh.position.set(world.x, 0.05, world.z);
        mesh.receiveShadow = true;
        tile.mesh = mesh;
        return mesh;
      }

      case 'key': {
        const art = buildKey(this._litMaterial(KEY_COLORS[tile.color], 0.5));
        // Laid almost flat, tipped slightly towards the camera. A key is a flat
        // shape, so standing it upright would make it vanish edge-on twice per
        // spin; face-up it reads as a key from every angle of the rotation.
        art.rotation.x = -Math.PI / 2 + 0.3;
        return this._pickup(tile, art, world, 0.45);
      }

      case 'tube': {
        // Left flat and unspun: from this camera a flat torus always reads as a
        // ring, and spinning it would only make it disappear at each quarter.
        const art = buildTube(this._litMaterial(0xff7a45, 0.4));
        const holder = this._pickup(tile, art, world, 0.35);
        tile.spinner = null;
        return holder;
      }

      case 'star': {
        const art = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32),
          this._litMaterial(0xffe066, 0.7),
        );
        art.castShadow = true;
        return this._pickup(tile, art, world, 0.6);
      }

      default:
        return null;
    }
  }

  /**
   * Wraps a pickup's art in holder -> spinner -> art. The holder carries the
   * position and bob, the spinner turns about world Y, so any tilt baked into
   * the art survives the rotation instead of tumbling with it.
   */
  _pickup(tile, art, world, height) {
    const holder = new THREE.Group();
    const spinner = new THREE.Group();
    spinner.add(art);
    holder.add(spinner);
    holder.position.set(world.x, height, world.z);
    tile.bobBase = height;
    tile.spinner = spinner;
    tile.mesh = holder;
    return holder;
  }

  /** Standard material with a matching emissive tint so colours stay readable. */
  _litMaterial(color, emissiveStrength) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      emissive: new THREE.Color(color).multiplyScalar(emissiveStrength),
    });
  }
}

/** A key: a torus bow with a small box shaft and tooth. */
function buildKey(material) {
  const group = new THREE.Group();

  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 16), material);
  bow.position.y = 0.17;
  group.add(bow);

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), material);
  shaft.position.y = -0.1;
  group.add(shaft);

  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.06), material);
  tooth.position.set(0.09, -0.2, 0);
  group.add(tooth);

  return group;
}

/** The inner tube: a flat-lying torus. */
function buildTube(material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 10, 20), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export { buildTube };
