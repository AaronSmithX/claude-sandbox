import * as THREE from 'three';
import { applyTexture } from './textures.js';

/**
 * Flat cards that stand on a tile and turn to face the viewer.
 *
 * This is how something with a complicated silhouette — a tree — gets into a level
 * without being modelled. One image on one plane, kept upright and turned about its
 * own trunk, which is the oldest trick there is and still the cheapest.
 *
 * ## A plane, not a THREE.Sprite
 *
 * A `Sprite` is the obvious tool and the wrong one here, on three counts.
 *
 * It faces the camera on *every* axis. Under this game's fixed overhead camera that
 * means a tree pitches back until it reads as lying on the ground rather than growing
 * out of it. Turning about Y alone keeps the trunk vertical, which is the entire
 * meaning of "standing on a tile".
 *
 * `SpriteMaterial` is unlit. Everything else in the level is a `MeshStandardMaterial`
 * under an ambient light and a directional sun, so a sprite would be flat-bright in a
 * scene where nothing else is, and read as pasted onto the picture instead of being
 * in it.
 *
 * And a sprite cannot cast a shaped shadow. `castShadow` on one is not honoured by the
 * shadow pass, whereas three copies `map` and `alphaTest` onto a mesh's depth material
 * — so a plane throws the silhouette of its canopy rather than of its rectangle.
 *
 * ## alphaTest, and specifically not transparent
 *
 * `transparent: true` is the reflex and it breaks a wood. It moves the mesh into the
 * sorted transparent pass where it no longer writes depth, so trees draw in the wrong
 * order against each other and each tree's own leaves fight. `alphaTest` alone gives a
 * hard cut-out in the opaque pass: depth is written, order stops mattering, and any
 * number of them can overlap.
 *
 * ## Where the yaw comes from
 *
 * Not from a camera held here. `TileMap.update` is called from `tickWorld`, which is
 * the rules function every headless test drives, and putting a `THREE.Camera` into
 * that path would drag one into the test helpers for the sake of a decoration. So the
 * yaw is pushed in from outside by whoever owns a camera, through
 * `TileMap.setViewYaw`.
 *
 * In the game that costs almost nothing: `CameraFollow` computes the camera's
 * orientation once and freezes it, so the yaw is a constant and `setYaw` early-returns
 * every frame after the first. The machinery is really for the level editor, whose
 * preview is on OrbitControls and genuinely turns.
 */

/**
 * One card to stand somewhere.
 * @typedef {object} BillboardTile
 * @property {number} x
 * @property {number} y  the top of the ground it stands on
 * @property {number} z
 * @property {import('./looks.js').Look} look
 */

/** How big a card is when its look does not say. */
const DEFAULT_TALL = 1.6;
const DEFAULT_WIDE = 1.2;

export class Billboards {
  /** @param {BillboardTile[]} tiles */
  constructor(tiles) {
    this.group = new THREE.Group();
    this._yaw = 0;
    this._elapsed = 0;

    // Shared per look, the same way the tile meshes share theirs — and built in here
    // rather than at module level so that the single `disposeTree` walk over the
    // stage's group frees them when the stage unloads.
    /** @type {Map<string, THREE.PlaneGeometry>} */
    const geometries = new Map();
    /** @type {Map<string, THREE.Material>} */
    const materials = new Map();

    for (const { x, y, z, look } of tiles) {
      const tall = look.tall ?? DEFAULT_TALL;
      const wide = look.wide ?? DEFAULT_WIDE;
      const key = `${look.texture ?? ''}|${wide}x${tall}`;

      let geometry = geometries.get(key);
      if (!geometry) {
        geometry = new THREE.PlaneGeometry(wide, tall);
        // Move the origin to the foot of the card. Then the mesh sits at exactly the
        // height of its ground, and turning it about Y pivots around the trunk — so a
        // tree spins on the spot instead of swinging off its own square.
        geometry.translate(0, tall / 2, 0);
        geometry.computeBoundingBox();
        geometries.set(key, geometry);
      }

      let material = materials.get(key);
      /** @type {?Promise<void>} */
      let pending = null;
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          color: look.color,
          roughness: look.roughness ?? 1,
          alphaTest: 0.5,
          transparent: false,
          side: THREE.DoubleSide,
        });
        pending = applyTexture(material, look.texture);
        materials.set(key, material);
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'billboard';
      mesh.position.set(x, y, z);
      mesh.rotation.y = this._yaw;
      // A cut-out shadow needs the cut-out, and until the image lands there isn't one:
      // the card would throw a hard rectangle across the floor for a frame or two.
      mesh.castShadow = false;
      this.group.add(mesh);

      // Nothing to show until there is something to show. Without a texture the card
      // is a plain coloured oblong, which is worse than nothing standing there — but
      // only hide it when an image really is on its way, or a look that never had one
      // would stay invisible forever.
      if (pending) {
        mesh.visible = false;
        pending.then(() => {
          for (const other of this.group.children) {
            if (other.material === material) other.visible = true;
          }
        });
      }
    }
  }

  /**
   * Turns every card to face this way. Cheap to call every frame: the game's camera
   * never turns, so this is one comparison and a return.
   *
   * @param {number} yaw radians about Y, as `cameraYaw` reports it
   */
  setYaw(yaw) {
    if (yaw === this._yaw) return;
    this._yaw = yaw;
    for (const mesh of this.group.children) mesh.rotation.y = yaw;
  }

  update(dt) {
    this._elapsed += dt;
  }
}

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Which way a camera is looking, ignoring how far up or down.
 *
 * YXZ order is what makes that true: it puts the Y rotation outermost, so an overhead
 * camera's steep downward pitch comes out in the X term and leaves the heading alone.
 * Read off the default XYZ order, a camera looking down at 45° reports a yaw that
 * swings as it pitches, and every tree in the level leans with it.
 *
 * @param {THREE.Camera} camera
 * @returns {number}
 */
export function cameraYaw(camera) {
  return _euler.setFromQuaternion(camera.quaternion, 'YXZ').y;
}
