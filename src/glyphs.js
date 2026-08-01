/**
 * The default dialect: which character means which tile, before any stage has said
 * otherwise.
 *
 * A map's grid is one character per cell, because that is what makes a level readable
 * as a picture of itself — a run of `#` looks like the wall it is. But a
 * character is only a *binding*: what it binds to is a name from the vocabulary in
 * `src/tilemap.js`, and names never run out. That is the whole point of the split.
 * Adding a fourth key colour is a line in `KEY_COLORS`; it does not cost two more
 * punctuation marks, and it cannot collide with anything.
 *
 * This table is what every stage starts from, and most stages need nothing else. A
 * stage that wants a character of its own says so in its `legend`, which is merged
 * over this one — so a binding here is a default, not a law. Two stages may use `k`
 * for two different things, and neither has to ask permission.
 *
 * The case convention is worth keeping in anything you add: an uppercase letter is
 * the thing that blocks you, its lowercase partner is the state that doesn't.
 *
 * @type {Record<string, string>}
 */
export const GLYPHS = {
  '#': 'wall',
  '.': 'floor',
  '~': 'water',
  i: 'ice',
  // There is no character for raised ground, and deliberately so. Height comes from
  // the layer a tile is drawn on: `.` on the second grid is floor one level up. A `'`
  // that meant "floor:1" drawn on the ground grid used to do the same job, and it
  // read badly both ways round — the walkable space it made never appeared on the
  // grid for the storey it belonged to, and it collided with whatever the layer above
  // had to say about the same cell.
  '/': 'stair',
  '\\': 'slide',
  E: 'elevator/top',
  e: 'elevator',
  B: 'crate',
  p: 'plate:red',
  q: 'plate:cyan',
  r: 'plate:pink',
  P: 'gate:red',
  Q: 'gate:cyan',
  R: 'gate:pink',
  a: 'pad:a',
  b: 'pad:b',
  c: 'pad:c',
  '@': 'spawn',
  '*': 'star',
  O: 'tube',
  g: 'key:gold',
  v: 'key:violet',
  w: 'key:white',
  G: 'door:gold',
  V: 'door:violet',
  W: 'door:white',
  1: 'switch:red',
  2: 'switch:cyan',
  3: 'switch:pink',
  4: 'switch:red/pressed',
  5: 'switch:cyan/pressed',
  6: 'switch:pink/pressed',
  X: 'obstacle:red',
  Y: 'obstacle:cyan',
  Z: 'obstacle:pink',
  x: 'obstacle:red/retracted',
  y: 'obstacle:cyan/retracted',
  z: 'obstacle:pink/retracted',
  '|': 'enemy:vertical',
  '-': 'enemy:horizontal',
  ')': 'enemy:clockwise',
  '(': 'enemy:counterclockwise',
};
