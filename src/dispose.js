/**
 * Frees the GPU resources under an Object3D.
 *
 * This exists because a stage is now a thing that gets *unloaded*: every stage
 * builds its own tile meshes and its own enemies, and geometries and materials are
 * not garbage collected — dropping the last reference to one leaves it on the GPU
 * until something calls `dispose()` on it. Playing a four-stage run and starting
 * over would otherwise pile up four runs' worth.
 *
 * Meshes share both geometries and materials — one floor geometry serves every
 * floor tile — so each is disposed exactly once.
 *
 * Textures are deliberately *not* disposed here, even though a material holds one as
 * `.map`. A material belongs to one stage and dies with it; a texture belongs to the
 * page and is shared by every stage that ever asks for it, from the cache in
 * `src/textures.js`. Freeing one here would pull the image out from under the next
 * stage that wanted the same wall. That asymmetry is safe only while nothing creates a
 * texture per material — see the note in `src/textures.js`, which is also why a wall's
 * texture repeat is baked into its geometry rather than set on the texture.
 *
 * The `seen` set guards against disposing one thing twice within a call, not across
 * calls: anything shared between two stages would be disposed once per unload. Which
 * is why everything this walks is built per-TileMap, inside `_build`.
 *
 * @param {import('three').Object3D} root
 */
export function disposeTree(root) {
  const seen = new Set();

  root.traverse((object) => {
    const geometry = /** @type {any} */ (object).geometry;
    if (geometry && !seen.has(geometry)) {
      seen.add(geometry);
      geometry.dispose();
    }

    const material = /** @type {any} */ (object).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const one of materials) {
      if (seen.has(one)) continue;
      seen.add(one);
      one.dispose();
    }
  });
}
