import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Billboards, cameraYaw } from '../src/billboards.js';
import { LOOKS } from '../src/looks.js';
import { makeMap } from './helpers/level.js';
import { Inventory } from '../src/inventory.js';

/** @type {import('../src/looks.js').Look} */
const TREE = { shape: 'billboard', color: 0xffffff, tall: 2, wide: 1.5 };

const twoTrees = () =>
  new Billboards([
    { x: 0, y: 0, z: 0, look: TREE },
    { x: 3, y: 1, z: -2, look: TREE },
  ]);

describe('a card that turns to face the viewer', () => {
  it('turns about the upright axis and no other', () => {
    // The whole difference from a THREE.Sprite, which faces the camera on every axis
    // and so tips a tree backwards under this game's overhead camera until it reads
    // as lying on the ground.
    const cards = twoTrees();
    cards.setYaw(Math.PI / 2);
    for (const mesh of cards.group.children) {
      expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2);
      expect(mesh.rotation.x).toBe(0);
      expect(mesh.rotation.z).toBe(0);
    }
  });

  it('does nothing when told the same yaw again', () => {
    // The game's camera is aimed once and frozen, so this is what happens on all but
    // the first frame of every stage: one comparison and a return.
    const cards = twoTrees();
    cards.setYaw(1);
    cards.group.children[0].rotation.y = 99;
    cards.setYaw(1);
    expect(cards.group.children[0].rotation.y).toBe(99);
  });

  it('stands on the tile rather than sinking half into it', () => {
    // The origin is moved to the foot of the card, so the mesh sits at exactly the
    // height of its ground and turning it pivots about the trunk.
    const [first, second] = twoTrees().group.children;
    expect(first.geometry.boundingBox.min.y).toBeCloseTo(0);
    expect(first.geometry.boundingBox.max.y).toBeCloseTo(2);
    expect(first.position.y).toBe(0);
    expect(second.position.y).toBe(1);
  });

  it('is a hard cut-out rather than a sorted transparent thing', () => {
    // `transparent: true` would take it out of the opaque pass and stop it writing
    // depth, so a wood renders in the wrong order and each tree's leaves fight.
    const [mesh] = twoTrees().group.children;
    expect(mesh.material.alphaTest).toBe(0.5);
    expect(mesh.material.transparent).toBe(false);
    expect(mesh.material.side).toBe(THREE.DoubleSide);
  });

  it('shares one geometry and one material across identical cards', () => {
    const [a, b] = twoTrees().group.children;
    expect(a.geometry.uuid).toBe(b.geometry.uuid);
    expect(a.material.uuid).toBe(b.material.uuid);
  });
});

describe('which way a camera is looking', () => {
  const looking = (x, y, z) => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    return cameraYaw(camera);
  };

  it('ignores how steeply the camera is pitched down', () => {
    // The game's own offset, from src/camera-follow.js: above and behind, looking at
    // the origin. Read off the default XYZ euler order this comes out swinging with
    // the pitch, and every tree in the level leans with it.
    expect(looking(0, 11, 8.5)).toBeCloseTo(0);
    expect(looking(0, 40, 8.5)).toBeCloseTo(0);
  });

  it('reports a quarter turn as a quarter turn', () => {
    expect(looking(8.5, 11, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe('a tree on a map', () => {
  const treeMap = () =>
    makeMap(['#####', '#@..T', '#####'], { build: true, legend: { T: 'wall:tree' } });

  it('is still a wall to everything that decides where you may go', () => {
    // The point of the whole exercise, on the one tile where appearance departs
    // furthest from the shape of the thing.
    const map = treeMap();
    expect(map.get(4, 1).type).toBe('wall');
    expect(map.canEnter(4, 1, new Inventory())).toBe(false);
    expect(map.isWalkable(4, 1)).toBe(false);
  });

  it('stands a card on the tile, on ground of its own', () => {
    const map = treeMap();
    expect(map._billboards).not.toBe(null);
    const cards = map._billboards.group.children;
    expect(cards).toHaveLength(1);
    const world = map.gridToWorld(4, 1);
    expect(cards[0].position.x).toBeCloseTo(world.x);
    expect(cards[0].position.z).toBeCloseTo(world.z);
    // A wall drawn as something standing on a tile still gets the tile: without this
    // the tree would be rooted in a hole.
    const ground = [];
    map.group.traverse((o) => {
      if (o.name === 'ground' && Math.abs(o.position.x - world.x) < 0.01) ground.push(o);
    });
    expect(ground).toHaveLength(1);
  });

  it('takes the yaw the map was already given', () => {
    const map = treeMap();
    map.setViewYaw(1.25);
    expect(map._billboards.group.children[0].rotation.y).toBeCloseTo(1.25);
  });

  it('builds no cards at all on a map with none', () => {
    expect(makeMap(['###', '#@#', '###'], { build: true })._billboards).toBe(null);
  });

  it('gives a grey block a body but no card', () => {
    // The other branch: a block-shaped look is the wall itself, not a thing standing
    // on one, and must not end up in both places.
    const map = makeMap(['###', '#@#', '###'], { build: true });
    let walls = 0;
    map.group.traverse((o) => {
      if (o.isMesh && o.name === 'wall') walls++;
    });
    expect(walls).toBe(8);
  });
});

describe('the tree look as shipped', () => {
  it('stands taller than a storey, or it reads as a bush', () => {
    expect(LOOKS.tree.shape).toBe('billboard');
    expect(LOOKS.tree.tall).toBeGreaterThan(1);
    expect(LOOKS.tree.texture).toBe('tree');
  });
});
