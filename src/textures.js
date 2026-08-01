import * as THREE from 'three';
import { BRICK, FLAGSTONE, ROCK, TREE } from './textures/patterns.js';

/**
 * Turning an image into something a material can wear.
 *
 * Two things make this more than a call to `TextureLoader`.
 *
 * **It has to do nothing at all in Node.** `TextureLoader` reaches through
 * `ImageLoader` to `document.createElementNS`, and the test suite runs in plain Node
 * with no DOM (`vite.config.js` sets `environment: 'node'`). That is not a corner
 * case: `test/tilemap.test.js` builds every shipped stage's meshes, and so does the
 * `builds its meshes` check in `src/level-checks.js`, which `test/levels.test.js` runs
 * over the whole campaign. So every stage in the game has its meshes constructed
 * headlessly on every CI run, and anything here that touched an Image would break all
 * of them at once. `applyTexture` returns early with no DOM and never constructs a
 * Texture at all.
 *
 * **A material must read correctly before its image lands.** Assigning
 * `material.map = loader.load(url)` is the obvious shape and the wrong one: it hands
 * the material a Texture with no image yet, which samples black under
 * `MeshStandardMaterial` and shows as a flash of dark on every surface. Materials are
 * built with their look's colour and only ever *gain* a map, so the first frame, a
 * slow load and a headless build all show the same correct thing.
 *
 * ## Lifetimes, which are deliberately not the same
 *
 * Materials belong to a stage. They are built inside `TileMap._build` and disposed by
 * the single `disposeTree` walk in `TileMap.dispose()` when the stage unloads.
 *
 * Textures belong to the page. They live in `cache` below for as long as the tab is
 * open and are never disposed, so walking into a fourth stage with brick walls reuses
 * one upload rather than making a fourth. `material.dispose()` does not touch
 * `.map`, and `src/dispose.js` deliberately does not either — see the note there.
 *
 * The rule that keeps those two lifetimes from colliding: **never create a Texture per
 * material.** That is why a wall's repeat is baked into its geometry by `tileBoxUVs`
 * rather than set as `texture.repeat`, which would need one Texture per wall height.
 */

/**
 * Every texture there is, by the name a look asks for it by.
 *
 * These are `data:` URLs from `src/textures/patterns.js`, but nothing here cares —
 * a texture is a URL. To use a painted image instead, drop the file next to the
 * patterns and import it: `import brickUrl from './textures/brick.png'`, then put
 * `brickUrl` here. Vite hashes it into the build and rewrites the URL with the
 * '/claude-sandbox/' base, so that is the whole change.
 *
 * @type {Record<string, string>}
 */
export const TEXTURES = {
  brick: BRICK,
  rock: ROCK,
  flagstone: FLAGSTONE,
  tree: TREE,
};

const HAS_DOM = typeof document !== 'undefined';

/**
 * url -> the texture and a promise for when its image has actually arrived.
 * Page-lifetime; see the note above.
 * @type {Map<string, {texture: THREE.Texture, ready: Promise<THREE.Texture>}>}
 */
const cache = new Map();

/**
 * How sharp a texture may be when seen edge-on. Set once from the renderer, because
 * the cap is a property of the GPU and nothing here has a renderer to ask.
 */
let anisotropy = 1;

/**
 * Tells this module what the renderer can do. Call once, after a renderer exists —
 * `src/main.js` for the game, `src/editor/preview.js` for the editor.
 *
 * Anisotropy earns its line here more than anywhere else in the project: the floor is
 * a flat plane under a camera fixed at a shallow angle, which is precisely the case
 * where trilinear filtering smears a texture into mush a few tiles out.
 *
 * @param {{anisotropy?: number}} caps
 */
export function configureTextures({ anisotropy: max = 1 } = {}) {
  anisotropy = Math.max(1, max);
  // Anything already loaded was built against the old value.
  for (const { texture } of cache.values()) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
}

/**
 * The texture for a URL, started once and shared, with a promise for the moment its
 * image is actually in it.
 */
function load(url) {
  const found = cache.get(url);
  if (found) return found;

  /** @type {(t: THREE.Texture) => void} */
  let arrived;
  const ready = new Promise((resolve) => {
    arrived = resolve;
  });
  const texture = new THREE.TextureLoader().load(url, (t) => arrived(t));

  // A colour map holds sRGB values; saying so is what keeps a mid grey a mid grey
  // instead of coming out washed out once three converts to linear for lighting.
  texture.colorSpace = THREE.SRGBColorSpace;
  // Always, because `tileBoxUVs` writes UVs past 1 — that is how one texture tile is
  // made to cover one world unit on a wall of any height.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;

  const entry = { texture, ready };
  cache.set(url, entry);
  return entry;
}

/**
 * Hangs a texture on a material, once its image has arrived. Safe to call from
 * anywhere mesh construction happens, including headlessly, where it does nothing at
 * all and the material keeps its look's colour for good.
 *
 * The wait is the point. Assigning the Texture straight away is the obvious shape and
 * the wrong one: three binds a placeholder for a texture with no image yet, so every
 * textured surface in the level flashes as the stage opens. Waiting means a material
 * only ever goes from *right* to *right*, and the colour it was built with is a real
 * fallback rather than something nobody ever sees.
 *
 * @param {THREE.Material & {map?: ?THREE.Texture, needsUpdate?: boolean}} material
 * @param {string} [name] a key of `TEXTURES`; a look with no texture passes undefined
 * @returns {?Promise<void>} null when there was nothing to do, which is how a caller
 *   can tell "this will be textured shortly" from "this never will be"
 */
export function applyTexture(material, name) {
  if (!name || !HAS_DOM) return null;
  const url = TEXTURES[name];
  if (!url) throw new Error(`No texture named "${name}"`);
  return load(url).ready.then((texture) => {
    material.map = texture;
    material.needsUpdate = true;
  });
}

/**
 * Scales a box's UVs so one texture tile covers one world unit on every face.
 *
 * `BoxGeometry` lays down the same 0..1 UVs on every face however big the box is, so a
 * wall built 1.6 tall wears bricks 60% taller than the 1.0 wall beside it — which is
 * exactly what happens along the edge of a plateau, where walls grow to stand above the
 * ground they hold in. Scaling the UVs by the box's own dimensions puts every brick in
 * the level on the same grid.
 *
 * Done to the geometry rather than by setting `texture.repeat` because repeat lives on
 * the Texture: matching it to each wall height would mean a Texture, and therefore a
 * material, per height — and the sharing of one material per look is what the geometry
 * cache, `disposeTree` and the page-lifetime texture cache are all built around.
 *
 * @param {THREE.BufferGeometry} geometry an unsegmented box; anything else is left alone
 */
export function tileBoxUVs(geometry, width, height, depth) {
  const uv = geometry.getAttribute('uv');
  // 6 faces x 4 corners. A segmented box has more, and its UV layout is not this one.
  if (!uv || uv.count !== 24) return geometry;

  // Face order is +x, -x, +y, -y, +z, -z. The two sides facing along x show the box's
  // depth and height; the caps show width and depth; the two facing along z show width
  // and height.
  const spans = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}
