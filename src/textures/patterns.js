/**
 * The images, written out rather than drawn.
 *
 * Every pattern here is SVG source in this file, turned into a `data:` URL at import.
 * That follows the rule `src/audio/index.js` sets for scores: keep them out of the
 * network path entirely — no loading state that can fail, no second request, and no
 * chance of the GitHub Pages base path ('/claude-sandbox/') being left off a URL. It
 * also keeps a texture *editable*: a brick is a dozen rectangles you can nudge, in a
 * diff you can read, rather than a binary blob nobody will ever open again.
 *
 * The trade against a real PNG is detail. These are flat vector patterns and they will
 * never look photographed. Swapping one out for a painted image is deliberately a
 * one-line change — see the note on `TEXTURES` in `src/textures.js` — so the moment a
 * pattern here is the thing holding a level back, replace it and keep everything else.
 *
 * Two rules for anything added here:
 *
 *   Tile seamlessly. Every one of these repeats across a surface, so a shape crossing
 *   an edge has to be drawn again on the far side or the seam shows as a grid.
 *   State width and height on the root. An <svg> without them has no intrinsic size,
 *   and a browser rasterising one inside an <img> is entitled to guess.
 */

/**
 * SVG source as a URL an <img> will accept.
 *
 * Percent-encoded rather than base64: it survives a diff, and `#` in particular *must*
 * be escaped or everything after the first colour is read as a fragment identifier.
 */
function svg(width, height, body) {
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(source)}`;
}

/**
 * Running bond, four courses to a tile.
 *
 * Every other course is offset half a brick, which means the bricks at the ends of it
 * run off both edges — so each is drawn twice, once falling off the right and once
 * arriving from the left. Those two halves are what meet up when the texture repeats.
 */
const course = (y, offset) => {
  const bricks = [];
  for (let x = offset - 32; x < 64; x += 32) {
    bricks.push(`<rect x="${x + 1}" y="${y + 1}" width="30" height="14" rx="1"/>`);
  }
  return bricks.join('');
};

export const BRICK = svg(
  64,
  64,
  // Mortar is the background; the bricks are laid on top of it with a gap all round,
  // so the joint width is one number in one place.
  '<rect width="64" height="64" fill="#6d3a2c"/>' +
    '<g fill="#8a4a3c">' +
    course(0, 0) +
    course(16, 16) +
    course(32, 0) +
    course(48, 16) +
    '</g>' +
    // A highlight along the top of each course, so the courses read as stacked rather
    // than as a flat grid of rectangles.
    '<g fill="#9c5849" opacity="0.7">' +
    [0, 16, 32, 48].map((y) => `<rect x="0" y="${y + 1}" width="64" height="2"/>`).join('') +
    '</g>',
);

/**
 * Weathered rock: irregular blotches on a grey ground.
 *
 * The blotches are placed by hand rather than by a loop because they have to miss the
 * edges — anything crossing one would need its twin drawn on the far side, and at this
 * size it is cheaper to keep them inboard than to wrap eight shapes.
 */
export const ROCK = svg(
  64,
  64,
  '<rect width="64" height="64" fill="#6b6f76"/>' +
    '<g fill="#787d85">' +
    '<ellipse cx="18" cy="14" rx="11" ry="8"/>' +
    '<ellipse cx="46" cy="34" rx="13" ry="9"/>' +
    '<ellipse cx="26" cy="49" rx="9" ry="7"/>' +
    '</g>' +
    '<g fill="#5e626a">' +
    '<ellipse cx="45" cy="12" rx="8" ry="6"/>' +
    '<ellipse cx="12" cy="36" rx="7" ry="6"/>' +
    '<ellipse cx="52" cy="55" rx="9" ry="6"/>' +
    '</g>' +
    // Two cracks, kept clear of the border for the same reason.
    '<g stroke="#545861" stroke-width="1.5" fill="none" opacity="0.8">' +
    '<path d="M8 22 L22 28 L30 24"/>' +
    '<path d="M38 44 L48 48 L56 44"/>' +
    '</g>',
);

/**
 * Flagstones: four slabs to a tile, with the joints falling on the edges so that the
 * repeat lands on a joint rather than in the middle of a stone.
 */
export const FLAGSTONE = svg(
  64,
  64,
  '<rect width="64" height="64" fill="#4a4f57"/>' +
    '<g fill="#5b6068">' +
    '<rect x="1" y="1" width="36" height="28" rx="2"/>' +
    '<rect x="39" y="1" width="24" height="28" rx="2"/>' +
    '<rect x="1" y="31" width="24" height="32" rx="2"/>' +
    '<rect x="27" y="31" width="36" height="32" rx="2"/>' +
    '</g>' +
    // A lighter top edge on each slab: the same trick as the brick courses, and what
    // stops four rectangles reading as a drawn grid.
    '<g fill="#666c75" opacity="0.6">' +
    '<rect x="1" y="1" width="36" height="2"/>' +
    '<rect x="39" y="1" width="24" height="2"/>' +
    '<rect x="1" y="31" width="24" height="2"/>' +
    '<rect x="27" y="31" width="36" height="2"/>' +
    '</g>',
);

/**
 * A tree, as a card to stand on a tile.
 *
 * Unlike everything else here this one does not tile — it is one sprite, and the
 * transparency around it is the whole point: `alphaTest` cuts the canopy out against
 * whatever is behind it, so the silhouette is the shape rather than the rectangle.
 * Drawn on 64x96 because it stands taller than it is wide, and the plane it goes on
 * is sized to match.
 */
export const TREE = svg(
  64,
  96,
  // No background rect: everything not drawn is transparent, and that is what
  // `alphaTest` cuts away.
  '<rect x="27" y="52" width="10" height="42" fill="#5b4128" rx="2"/>' +
    '<rect x="27" y="52" width="4" height="42" fill="#6d4f31" rx="2"/>' +
    '<g fill="#2f6b38">' +
    '<ellipse cx="32" cy="34" rx="27" ry="24"/>' +
    '<ellipse cx="18" cy="46" rx="16" ry="13"/>' +
    '<ellipse cx="46" cy="46" rx="16" ry="13"/>' +
    '</g>' +
    // The light comes from up and to one side in this scene, so the canopy gets a
    // matching highlight or the tree reads as a flat green blob.
    '<g fill="#3d8a47">' +
    '<ellipse cx="26" cy="26" rx="17" ry="14"/>' +
    '<ellipse cx="43" cy="38" rx="11" ry="9"/>' +
    '</g>' +
    '<ellipse cx="24" cy="22" rx="9" ry="7" fill="#4da05a"/>',
);
