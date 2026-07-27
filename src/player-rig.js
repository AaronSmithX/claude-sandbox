import * as THREE from 'three';

// The hips sit at the rig's origin and the feet hang below it, so the player's
// world position still means "where the body is standing" — the same thing it
// meant when the player was a cube.
export const HIP_HEIGHT = 0.34;

const SKIN = 0xffb347; // the original player colour, kept for continuity
const CLOTH = 0xe2653a; // a darker tone for the legs, so they read separately

/**
 * A person built out of boxes: head, torso, two arms and two legs, about 0.9
 * units tall against 1.0-unit walls.
 *
 * The limbs hang from pivot groups placed at the hip and shoulder, so rotating a
 * limb swings it from the joint instead of sliding the whole box.
 *
 * @returns {{root: THREE.Group, body: THREE.Group, parts: RigParts}}
 *
 * @typedef {object} RigParts
 * @property {THREE.Mesh} torso
 * @property {THREE.Mesh} head
 * @property {THREE.Object3D} legL
 * @property {THREE.Object3D} legR
 * @property {THREE.Object3D} armL
 * @property {THREE.Object3D} armR
 *   `root` is what the game positions; `body` is the part that turns to face the
 *   direction of travel, so a turn never affects the rig's placement.
 */
export function buildPlayerRig() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = new THREE.MeshStandardMaterial({
    color: SKIN,
    roughness: 0.4,
    metalness: 0.12,
    emissive: 0x3a2400,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: CLOTH,
    roughness: 0.55,
    metalness: 0.08,
    emissive: 0x2a1206,
  });

  const torso = box(0.32, 0.3, 0.2, skin);
  torso.position.y = 0.15;
  body.add(torso);

  const head = box(0.24, 0.24, 0.22, skin);
  head.position.y = 0.44;
  body.add(head);

  // A darker band across the front of the head, which is what actually tells you
  // which way the player is looking from this camera angle.
  const visor = box(0.17, 0.06, 0.02, cloth);
  visor.position.set(0, 0.46, 0.115);
  body.add(visor);

  const legL = limb(body, [-0.085, 0, 0], 0.11, 0.34, 0.13, cloth);
  const legR = limb(body, [0.085, 0, 0], 0.11, 0.34, 0.13, cloth);
  const armL = limb(body, [-0.2, 0.26, 0], 0.09, 0.28, 0.1, skin);
  const armR = limb(body, [0.2, 0.26, 0], 0.09, 0.28, 0.1, skin);

  return { root, body, parts: { torso, head, legL, legR, armL, armR } };
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  return mesh;
}

/** A limb hanging from a joint, so `pivot.rotation.x` swings it. */
function limb(parent, [x, y, z], w, h, d, material) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const mesh = box(w, h, d, material);
  mesh.position.y = -h / 2;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}
