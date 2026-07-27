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
 *   i  ice — step onto it and you keep going that way until you are off it
 *
 *   g v w   keys  — gold, violet, white
 *   G V W   doors — gold, violet, white (a key opens only its own colour)
 *
 *   1 2 3   switches that start up   — red, cyan, pink
 *   4 5 6   switches that start down — red, cyan, pink (1 pairs with 4, and so on)
 *   X Y Z   obstacle columns that start RAISED    — red, cyan, pink
 *   x y z   obstacle columns that start RETRACTED — red, cyan, pink
 *
 *   | -     enemy patrolling vertically / horizontally (reverses when blocked)
 *   ) (     enemy turning clockwise / anticlockwise when blocked
 *
 * Obstacles belong to group A (uppercase) or group B (lowercase). Stepping on a
 * switch swaps which group of its colour is raised, so one press both opens and
 * closes. Only one switch of a colour is down at a time: pressing one lets every
 * other switch of that colour back up, and a switch that is already down does
 * nothing when you stand on it. So give a colour at least two switches, or the
 * one it has will be spent after a single press.
 */
export const LEGEND = {
  '#': { type: 'wall' },
  '.': { type: 'floor' },
  '~': { type: 'water' },
  i: { type: 'ice' },
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
  // The same three switches, but already held down at the start of the level.
  4: { type: 'switch', color: 'red', startPressed: true },
  5: { type: 'switch', color: 'cyan', startPressed: true },
  6: { type: 'switch', color: 'pink', startPressed: true },
  X: { type: 'obstacle', color: 'red', group: 'A' },
  Y: { type: 'obstacle', color: 'cyan', group: 'A' },
  Z: { type: 'obstacle', color: 'pink', group: 'A' },
  x: { type: 'obstacle', color: 'red', group: 'B' },
  y: { type: 'obstacle', color: 'cyan', group: 'B' },
  z: { type: 'obstacle', color: 'pink', group: 'B' },
  // Enemy spawns. The tile itself is ordinary floor; the pattern says which way
  // the enemy turns when something blocks its path.
  '|': { type: 'floor', enemy: 'vertical' },
  '-': { type: 'floor', enemy: 'horizontal' },
  ')': { type: 'floor', enemy: 'clockwise' },
  '(': { type: 'floor', enemy: 'counterclockwise' },
};

// The level. Nine rooms on a 16x16 grid, chained so every mechanic sits on the
// critical path: ice corridor -> gold door -> inner tube -> red switch ->
// pink switch -> white key -> violet door -> cyan switch -> water crossing ->
// star.
export const DEFAULT_MAP = [
  '################',
  '#@...#1...#...##',
  '#....G....X..Zw#',
  '#..g.#.O..#...##',
  '#.i..#x..3#..z.#',
  '##i#############',
  '#2i|.#....#....#',
  '#....#~~~~.....#',
  '#....#~~~~#-...#',
  '#...v#....#....#',
  '##.####Y####W###',
  '#.iy.#)...#(...#',
  '#.i..V....#....#',
  '#.iii#....#..*.#',
  '#....#....#....#',
  '################',
];

// Column heights. Columns are 1.0 tall and centred on the group origin, and the
// floor top is y = 0.
const COLUMN_RAISED_Y = 0.5;
// A retracted column keeps its head above the floor: you can walk over these,
// but you can still see where they are, which is the difference between planning
// a route and being surprised by one coming up under you.
const COLUMN_STUB_HEIGHT = 0.06;
const COLUMN_RETRACTED_Y = COLUMN_STUB_HEIGHT - 0.5;

// How far below the floor plane you stand when you are in the water. The water
// slab spans y -0.21..-0.09, so this submerges a walker to about the knee and
// puts the inner tube right at the surface — which is the point: it shows that
// the tube is what's keeping you up.
export const WATER_SINK = 0.24;

// Floor buttons: the grey plate they sit on, and the button's height when up and
// when pressed.
const SWITCH_BASE_SIZE = TILE_SIZE * 0.78;
const SWITCH_UP_Y = 0.09;
const SWITCH_DOWN_Y = 0.035;

/**
 * Builds every tile from basic 3D shapes and owns the level's mutable state:
 * which pickups are gone, which doors are open, and which obstacle group is
 * currently raised per colour.
 */
export class TileMap {
  /**
   * @param {string[]} map rows of legend characters; every row must be the same
   *   length. Defaults to the shipped level, but tests pass miniature levels.
   * @param {{build?: boolean}} [options] `build: false` skips all mesh
   *   construction, which is how the headless tests run. Every mesh write in
   *   this class is guarded, so the rules behave identically either way.
   */
  constructor(map = DEFAULT_MAP, { build = true } = {}) {
    this.map = map;
    this.rows = map.length;
    this.cols = map[0].length;
    this.build = build;
    this.group = new THREE.Group();
    this.spawn = { gx: 1, gz: 1 };

    // Called with no arguments when the player reaches the star.
    this.onWin = null;

    /**
     * Called as things happen on the level, so effects can be hung off the rules
     * without the rules knowing about particles or sound.
     * @type {?(name: 'pickup'|'door'|'switch', detail: object) => void}
     */
    this.onEvent = null;

    this._elapsed = 0;
    this._parse();
    if (build) this._build();
    this._resetState();
  }

  // --- Map data -------------------------------------------------------------

  _parse() {
    this.tiles = [];
    this.enemySpawns = [];
    // Kept flat, because pressing a switch has to reach every other switch of
    // its colour wherever it is on the map.
    this._switches = [];
    for (let z = 0; z < this.rows; z++) {
      if (this.map[z].length !== this.cols) {
        throw new Error(
          `Map row ${z} is ${this.map[z].length} characters, expected ${this.cols}`,
        );
      }
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        const char = this.map[z][x];
        const def = LEGEND[char];
        if (!def) throw new Error(`Unknown map character "${char}" at ${x},${z}`);
        if (def.type === 'spawn') this.spawn = { gx: x, gz: z };
        if (def.enemy) this.enemySpawns.push({ gx: x, gz: z, pattern: def.enemy });
        const tile = { ...def, gx: x, gz: z };
        if (tile.type === 'switch') this._switches.push(tile);
        row.push(tile);
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

  /**
   * Terrain-only walkability: what an enemy can cross. Walls, water and doors
   * always block — doors whether open or shut, so a patrol stays in its room —
   * while columns block only while they are raised.
   */
  isWalkable(gx, gz) {
    const t = this.get(gx, gz);
    if (!t) return false;
    if (t.type === 'wall' || t.type === 'water' || t.type === 'door') return false;
    if (t.type === 'obstacle') return !this.isRaised(t);
    return true;
  }

  findSpawn() {
    return { ...this.spawn };
  }

  /**
   * How far below the floor plane something standing on this tile sits. Water is
   * the only tile you sink into; everything else is level ground.
   */
  surfaceY(gx, gz) {
    return this.get(gx, gz)?.type === 'water' ? -WATER_SINK : 0;
  }

  /** True when standing here means sliding on. */
  isSlippery(gx, gz) {
    return this.get(gx, gz)?.type === 'ice';
  }

  /**
   * Whether something sliding out of control may enter this tile. Everything the
   * player could walk onto, minus shut doors: a slide is not a decision, so it
   * must not spend a key for you. You stop against the door and open it by
   * walking into it deliberately.
   */
  canSlideInto(gx, gz, inventory) {
    const t = this.get(gx, gz);
    if (!t) return false;
    if (t.type === 'door' && !t.open) return false;
    return this.canEnter(gx, gz, inventory);
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
   * Spends a key to open a closed door. Called before the move starts, so the
   * panel has the whole step to swing out of the way as the player walks in.
   */
  openDoor(gx, gz, inventory) {
    const t = this.get(gx, gz);
    if (!t || t.type !== 'door' || t.open) return false;
    if (!inventory.useKey(t.color)) return false;
    t.open = true;
    this._emit('door', t);
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
        this._emit('pickup', t);
        break;

      case 'tube':
        if (t.taken) return;
        t.taken = true;
        if (t.mesh) t.mesh.visible = false;
        inventory.setTube(true);
        this._emit('pickup', t);
        break;

      case 'switch':
        // A switch already held down does nothing, so standing on it is not an
        // event either — no click, no spark.
        if (this.pressSwitch(t)) this._emit('switch', t);
        break;

      case 'star':
        if (inventory.won) return;
        inventory.setWon(true);
        this._emit('pickup', t);
        this.onWin?.();
        break;
    }
  }

  /** @param {'pickup'|'door'|'switch'} name */
  _emit(name, tile) {
    this.onEvent?.(name, {
      kind: tile.type,
      color: tile.color,
      position: this.gridToWorld(tile.gx, tile.gz),
    });
  }

  /**
   * Presses a switch: it goes down, every other switch of its colour comes back
   * up, and the raised obstacle group of that colour swaps over.
   *
   * A switch that is already down cannot be pressed again — there is nothing
   * left in it to push — so standing on one is a no-op rather than a way to
   * toggle the columns back and forth on the spot.
   *
   * @returns {boolean} whether the press did anything
   */
  pressSwitch(tile) {
    if (tile.type !== 'switch' || tile.pressed) return false;

    for (const other of this._switchesOf(tile.color)) other.pressed = false;
    tile.pressed = true;
    this.phase[tile.color] = this.phase[tile.color] === 'A' ? 'B' : 'A';
    return true;
  }

  isPressed(tile) {
    return tile.pressed === true;
  }

  /** Every switch tile of one colour, including any not yet pressed. */
  _switchesOf(color) {
    return this._switches.filter((t) => t.color === color);
  }

  // --- State ----------------------------------------------------------------

  _resetState() {
    // Group A is the one raised at the start of the level.
    this.phase = { red: 'A', cyan: 'A', pink: 'A' };

    for (const row of this.tiles) {
      for (const t of row) {
        t.taken = false;
        t.open = false;
        // Whether a switch starts down is authored per tile, by the legend
        // character used for it.
        if (t.type === 'switch') t.pressed = t.startPressed === true;
        if (t.mesh) t.mesh.visible = true;
        if (t.swing) t.swing.rotation.y = 0;
        if (t.columns) {
          t.columns.position.y = this.isRaised(t) ? COLUMN_RAISED_Y : COLUMN_RETRACTED_Y;
        }
        if (t.button) {
          const down = this.isPressed(t);
          t.button.position.y = down ? SWITCH_DOWN_Y : SWITCH_UP_Y;
          t.button.material.color.copy(down ? t.downColor : t.idleColor);
          t.button.material.emissive.copy(down ? t.downEmissive : t.idleEmissive);
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
    // Doors get a faster factor: the panel has one 0.14s step to clear the
    // doorway the player is already walking into.
    const kDoor = 1 - Math.pow(0.00002, dt);

    for (const row of this.tiles) {
      for (const t of row) {
        if (t.columns) {
          const target = this.isRaised(t) ? COLUMN_RAISED_Y : COLUMN_RETRACTED_Y;
          t.columns.position.y += (target - t.columns.position.y) * k;
        }

        // A door swings out of the doorway rather than blinking out of existence.
        if (t.swing) {
          const target = t.open ? DOOR_OPEN_ANGLE : 0;
          t.swing.rotation.y += (target - t.swing.rotation.y) * kDoor;
        }

        // A pressed button sinks into its plate and goes distinctly darker —
        // colour is what actually reads at this camera distance.
        if (t.button) {
          const pressed = this.isPressed(t);
          const target = pressed ? SWITCH_DOWN_Y : SWITCH_UP_Y;
          t.button.position.y += (target - t.button.position.y) * k;
          t.button.material.color.lerp(pressed ? t.downColor : t.idleColor, k);
          t.button.material.emissive.lerp(pressed ? t.downEmissive : t.idleEmissive, k);
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
    // Ice reads as ice by being the one bright, glossy thing on the floor: pale,
    // almost no roughness, and faintly lit so it stands out against the grass.
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xcfe8f5,
      roughness: 0.06,
      metalness: 0.35,
      emissive: 0x24485c,
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

        if (tile.type === 'ice') {
          // Flush with the floor it replaces, so you glide across the level
          // rather than up onto something.
          const mesh = new THREE.Mesh(floorGeo, iceMat);
          mesh.position.set(world.x, -0.1, world.z);
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
        const door = buildDoor(
          this._litMaterial(KEY_COLORS[tile.color], 0.35),
          this._litMaterial(new THREE.Color(KEY_COLORS[tile.color]).multiplyScalar(0.55), 0.3),
        );
        door.group.position.set(world.x, 0, world.z);
        door.group.rotation.y = this._doorFacing(tile);
        tile.mesh = door.group;
        tile.swing = door.swing;
        return door.group;
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
        const group = new THREE.Group();
        group.position.set(world.x, 0, world.z);

        // A grey plate a little smaller than the tile, so the button reads as a
        // fitting rather than something dropped on the floor.
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(SWITCH_BASE_SIZE, 0.06, SWITCH_BASE_SIZE),
          new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.85 }),
        );
        base.position.y = 0.02;
        base.receiveShadow = true;
        group.add(base);

        const button = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20),
          this._litMaterial(SWITCH_COLORS[tile.color], 0.45),
        );
        button.position.y = SWITCH_UP_Y;
        button.castShadow = true;
        button.receiveShadow = true;
        group.add(button);

        // _litMaterial hands out a fresh material per call, so darkening this
        // one on press affects only this switch.
        tile.button = button;
        tile.idleColor = button.material.color.clone();
        tile.idleEmissive = button.material.emissive.clone();
        tile.downColor = tile.idleColor.clone().multiplyScalar(0.4);
        tile.downEmissive = tile.idleEmissive.clone().multiplyScalar(0.2);

        tile.mesh = group;
        return group;
      }

      case 'key': {
        const art = buildKey(this._litMaterial(KEY_COLORS[tile.color], 0.5));
        // Upright, so it turns on the spot like a collectable. Leaned towards
        // the camera and rolled slightly so the bow's plane is never parallel to
        // the view — the one angle at which a ring would go invisible.
        art.rotation.set(0.22, 0, 0.14);
        return this._pickup(tile, art, world, 0.5);
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

  /**
   * Which way a door's slab must face. A door fills a gap in a wall, so the slab
   * has to span that gap: whichever pair of neighbours is solid tells you which
   * way the passage runs.
   * @returns {number} yaw in radians
   */
  _doorFacing(tile) {
    const solid = (gx, gz) => {
      const t = this.get(gx, gz);
      return !t || t.type === 'wall';
    };
    const acrossX = solid(tile.gx - 1, tile.gz) && solid(tile.gx + 1, tile.gz);
    const acrossZ = solid(tile.gx, tile.gz - 1) && solid(tile.gx, tile.gz + 1);
    // A door built along z (its default) blocks a passage running east-west.
    if (acrossZ && !acrossX) return Math.PI / 2;
    return 0;
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

// How far a door swings open: a little past 90 degrees, so it ends up flat
// against the wall beside it rather than half in the doorway.
const DOOR_OPEN_ANGLE = -1.75;

/**
 * A door: a thin panel standing upright in the tile, hinged at one edge.
 *
 * The hinge matters. A panel that pivots about the middle of the tile sweeps
 * through the very square the player is walking into; hinged at the edge it
 * swings away from them instead.
 *
 * @returns {{group: THREE.Group, swing: THREE.Group}} the tile-level group, and
 *   the inner group whose rotation.y animates from 0 to DOOR_OPEN_ANGLE.
 */
function buildDoor(material, panelMaterial) {
  const group = new THREE.Group();

  const swing = new THREE.Group();
  swing.position.x = -0.46; // the hinge, at the tile's edge
  group.add(swing);

  const panel = new THREE.Group();
  panel.position.x = 0.46; // back to the tile's centre
  swing.add(panel);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.94, 0.12), material);
  slab.position.y = 0.49;
  slab.castShadow = true;
  slab.receiveShadow = true;
  panel.add(slab);

  // A recessed rectangle, slightly darker and slightly proud of the slab, which
  // is what stops it reading as a plain coloured wall.
  const inset = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.14), panelMaterial);
  inset.position.y = 0.55;
  panel.add(inset);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10),
    panelMaterial,
  );
  handle.rotation.x = Math.PI / 2; // laid along z, poking out of the panel face
  handle.position.set(0.32, 0.48, 0);
  panel.add(handle);

  return { group, swing };
}

/**
 * A key, standing upright so it turns like a collectable rather than lying face
 * up. Every part is built to survive being seen edge-on, since a key spun about
 * the vertical axis passes through that view twice per turn: the shaft is round
 * rather than a flat box, and the bow is fat enough to still read as a ring of
 * metal from the side.
 */
function buildKey(material) {
  const group = new THREE.Group();

  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.055, 8, 18), material);
  bow.position.y = 0.17;
  group.add(bow);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8),
    material,
  );
  shaft.position.y = -0.1;
  group.add(shaft);

  // Teeth on both sides, so the silhouette says "key" from either profile.
  for (const x of [0.075, -0.075]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, 0.055), material);
    tooth.position.set(x, x > 0 ? -0.19 : -0.26, 0);
    group.add(tooth);
  }

  return group;
}

/** The inner tube: a flat-lying torus. */
function buildTube(material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 10, 20), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export { buildTube };
