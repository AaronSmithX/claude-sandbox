import * as THREE from 'three';
import { TILE_SIZE } from './tilemap.js';

/**
 * The shine on ice.
 *
 * Ice is already the palest, glossiest thing on the floor, but a still highlight
 * is just a colour: what says "frozen" is that the light moves on it. Two things
 * do that here, both drawn on top of the ice tiles rather than in place of them:
 *
 *  - a sheen, a soft band of light that sweeps diagonally across the whole rink
 *    at a steady pace, the way a low sun crosses a polished floor;
 *  - glints, small four-pointed stars sitting at fixed spots on the ice, each
 *    twinkling on its own clock and flaring as the sheen passes over it.
 *
 * Both are additive and unlit, so neither can darken the ice underneath — they
 * only ever add light — and both are one mesh with one material for the whole
 * map. As with the water, the brightness is a pure function of position and
 * time, which is what the tests read.
 */

/** World units between one sweep of the sheen and the next. */
export const SHEEN_SPACING = 7;
/** How fast the band travels along its diagonal, in units per second. */
export const SHEEN_SPEED = 2.1;
/** Half-width of the band, where it has fallen to about a third of full. */
export const SHEEN_WIDTH = 0.65;

/** How bright the sheen and the glints are allowed to get. */
const SHEEN_STRENGTH = 0.34;
const SHEEN_TINT = new THREE.Color(0xa8dcff);
const GLINT_TINT = new THREE.Color(0xe8f8ff);

/** Glints per tile, and how far off the surface each sits. */
const GLINTS_PER_TILE = 2;
const GLINT_LIFT = 0.02;
const GLINT_RADIUS = 0.13; // the long points of the star
const GLINT_WAIST = 0.028; // the short ones, between them

/**
 * How bright the sweeping sheen is at a point, 0..1 — full on the middle of the
 * band, falling away either side of it.
 *
 * The band runs across the diagonal, so it crosses a rink laid out along either
 * axis rather than running down a row of tiles and lighting all of them at once.
 *
 * @param {number} x @param {number} z @param {number} t seconds
 */
export function sheenAt(x, z, t) {
  const along = (x + z) * Math.SQRT1_2 - t * SHEEN_SPEED;
  const cycles = along / SHEEN_SPACING;
  // Distance to the nearest band, which is what makes the sweep repeat without
  // the brightness ever jumping.
  const offset = (cycles - Math.round(cycles)) * SHEEN_SPACING;
  return Math.exp(-(offset * offset) / (2 * SHEEN_WIDTH * SHEEN_WIDTH));
}

/**
 * A single glint's twinkle, 0..1: dark most of the time, with a sharp spike as
 * its phase comes round. Raising the sine to a high power is what makes it a
 * spark rather than a slow pulse.
 *
 * @param {number} t seconds @param {number} phase this glint's offset, radians
 * @param {number} [rate] radians per second
 */
export function glintAt(t, phase, rate = 1.7) {
  const swell = Math.sin(t * rate + phase);
  if (swell <= 0) return 0;
  return Math.pow(swell, 8);
}

/**
 * @typedef {object} IceTile
 * @property {number} x @property {number} z world centre of the tile
 * @property {number} y the height of its surface
 */

export class IceShimmer {
  /**
   * @param {IceTile[]} tiles every flat ice tile on the map
   * @param {{random?: () => number, segments?: number}} [options]
   *   `segments` divides a tile up so the band's falloff is drawn as a gradient
   *   rather than as one shade per tile.
   */
  constructor(tiles, { random = Math.random, segments = 3 } = {}) {
    this.group = new THREE.Group();
    this._elapsed = 0;

    this._sheen = buildSheen(tiles, segments);
    this._glints = buildGlints(tiles, random);
    this.group.add(this._sheen.mesh, this._glints.mesh);
    this.update(0);
  }

  /** @param {number} dt seconds */
  update(dt) {
    this._elapsed += dt;
    const t = this._elapsed;

    const sheen = this._sheen;
    const sheenColor = sheen.color.array;
    const sheenPoints = sheen.position.array;

    for (let v = 0; v < sheen.color.count; v++) {
      const i = v * 3;
      const light = sheenAt(sheenPoints[i], sheenPoints[i + 2], t) * SHEEN_STRENGTH;
      sheenColor[i] = SHEEN_TINT.r * light;
      sheenColor[i + 1] = SHEEN_TINT.g * light;
      sheenColor[i + 2] = SHEEN_TINT.b * light;
    }
    sheen.color.needsUpdate = true;

    const glints = this._glints;
    const glintColor = glints.color.array;

    for (const glint of glints.list) {
      // Its own twinkle, lifted the rest of the way as the sheen goes past: a
      // glint is brightest when the light is actually on it.
      const twinkle = glintAt(t, glint.phase, glint.rate);
      const light = twinkle * (0.3 + 0.7 * sheenAt(glint.x, glint.z, t));

      // Only the centre is lit. Its points are left black, so the star fades out
      // along its arms rather than ending in an edge.
      const centre = glint.first * 3;
      glintColor[centre] = GLINT_TINT.r * light;
      glintColor[centre + 1] = GLINT_TINT.g * light;
      glintColor[centre + 2] = GLINT_TINT.b * light;
    }
    glints.color.needsUpdate = true;
  }
}

/**
 * A quad over every ice tile, divided into `segments` each way. Neighbouring
 * tiles duplicate the vertices along their shared edge, which costs nothing here:
 * both copies are given the same colour by the same function of position, so the
 * seam is invisible.
 *
 * @param {IceTile[]} tiles @param {number} segments
 */
function buildSheen(tiles, segments) {
  const step = TILE_SIZE / segments;
  /** @type {number[]} */
  const points = [];
  /** @type {number[]} */
  const faces = [];

  for (const tile of tiles) {
    const x0 = tile.x - TILE_SIZE / 2;
    const z0 = tile.z - TILE_SIZE / 2;
    // Just clear of the ice, so the overlay never fights the tile for the pixel.
    const y = tile.y + 0.008;
    const base = points.length / 3;
    const at = (i, j) => base + i * (segments + 1) + j;

    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        points.push(x0 + i * step, y, z0 + j * step);
      }
    }

    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        faces.push(at(i, j), at(i, j + 1), at(i + 1, j));
        faces.push(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
      }
    }
  }

  return overlay(points, faces);
}

/**
 * Four-pointed stars scattered over the ice, two to a tile, each with its own
 * place, size and clock. Fixed positions rather than moving ones: a glint is a
 * facet of the ice catching the light, and a facet does not wander about.
 *
 * @param {IceTile[]} tiles @param {() => number} random
 */
function buildGlints(tiles, random) {
  /** @type {number[]} */
  const points = [];
  /** @type {number[]} */
  const faces = [];
  /** @type {{x: number, z: number, phase: number, rate: number, first: number}[]} */
  const list = [];

  for (const tile of tiles) {
    for (let n = 0; n < GLINTS_PER_TILE; n++) {
      const x = tile.x + (random() - 0.5) * TILE_SIZE * 0.7;
      const z = tile.z + (random() - 0.5) * TILE_SIZE * 0.7;
      const scale = 0.7 + random() * 0.6;
      const first = points.length / 3;

      // A fan from the centre out to eight rim points, alternating long and
      // short — which is the four-pointed star shape.
      points.push(x, tile.y + GLINT_LIFT, z);
      for (let arm = 0; arm < 8; arm++) {
        const angle = (arm / 8) * Math.PI * 2;
        const radius = (arm % 2 === 0 ? GLINT_RADIUS : GLINT_WAIST) * scale;
        points.push(
          x + Math.cos(angle) * radius,
          tile.y + GLINT_LIFT,
          z + Math.sin(angle) * radius,
        );
      }

      for (let arm = 0; arm < 8; arm++) {
        // Anticlockwise seen from above, so the star faces the camera.
        faces.push(first, first + 1 + ((arm + 1) % 8), first + 1 + arm);
      }

      list.push({
        x,
        z,
        phase: random() * Math.PI * 2,
        rate: 1.3 + random() * 0.9,
        first,
      });
    }
  }

  return { ...overlay(points, faces), list };
}

/**
 * An unlit, additive mesh that starts out black — invisible until something
 * writes light into its colours.
 *
 * The attributes come back with it, because animating one of these means writing
 * a colour per vertex every frame.
 *
 * @param {number[]} points @param {number[]} faces
 */
function overlay(points, faces) {
  const position = new THREE.BufferAttribute(new Float32Array(points), 3);
  const color = new THREE.BufferAttribute(new Float32Array(points.length), 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  geometry.setIndex(faces);

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  mesh.frustumCulled = false;
  return { mesh, position, color };
}
