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
