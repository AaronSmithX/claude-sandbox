import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TEXTURES, applyTexture, tileBoxUVs } from '../src/textures.js';
import { makeMap } from './helpers/level.js';

/**
 * Textures are the one part of this that genuinely cannot run here — turning a URL
 * into an image needs a DOM, and this suite has none. So most of what follows is about
 * that absence being harmless rather than about any image being right: a build with no
 * pictures in it has to produce exactly the same meshes, in the same materials, as one
 * with them.
 */

describe('running without a DOM', () => {
  it('has no DOM, which is the premise of everything below', () => {
    // Stated out loud so that whoever switches this suite to jsdom reads it first:
    // every guard in src/textures.js keys off this, and turning it on would put a
    // real image loader into every headless build.
    expect(typeof document).toBe('undefined');
  });

  it('leaves a material alone rather than reaching for an image', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x8a4a3c });
    expect(() => applyTexture(material, 'brick')).not.toThrow();
    expect(material.map).toBe(null);
    // And the colour it was built with survives, which is what the build then shows.
    expect(material.color.getHex()).toBe(0x8a4a3c);
  });

  it('does nothing at all for a look with no texture', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(() => applyTexture(material, undefined)).not.toThrow();
    expect(material.map).toBe(null);
  });

  it('builds a textured stage head-on without throwing', () => {
    // The real regression guard. `test/levels.test.js` and `test/tilemap.test.js`
    // build every shipped stage in this environment, so anything that touched an
    // Image here would take the whole campaign's tests down at once.
    const map = makeMap(['#####', '#@..R', '#####'], {
      build: true,
      legend: { R: 'wall:rock' },
    });
    let walls = 0;
    map.group.traverse((o) => {
      if (o.isMesh && o.name === 'wall') {
        walls++;
        expect(o.material.map).toBe(null);
      }
    });
    expect(walls).toBeGreaterThan(0);
  });
});

describe('the patterns', () => {
  it('are URLs an img can take, with their size stated', () => {
    for (const [name, url] of Object.entries(TEXTURES)) {
      expect(url.startsWith('data:image/svg+xml,'), name).toBe(true);
      // A percent-encoded '#' — the one character that must not survive raw, or
      // everything after the first colour is read as a fragment.
      expect(url.includes('%23'), name).toBe(true);
      expect(url.includes('%2523'), `${name} is double-encoded`).toBe(false);
      const source = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
      // Without an intrinsic size a browser rasterising this inside an <img> is
      // entitled to guess, and different browsers guess differently.
      expect(source, name).toMatch(/<svg[^>]*\bwidth="\d+"/);
      expect(source, name).toMatch(/<svg[^>]*\bheight="\d+"/);
      expect(source, name).toContain('xmlns="http://www.w3.org/2000/svg"');
    }
  });

  it('names a texture for every look that asks for one', async () => {
    const { LOOKS } = await import('../src/looks.js');
    for (const [name, look] of Object.entries(LOOKS)) {
      if (look.texture) expect(TEXTURES[look.texture], name).toBeTruthy();
    }
  });
});

describe('one texture tile per world unit', () => {
  /** The span a face's UVs cover, along u and v. */
  const spanOf = (geometry, face) => {
    const uv = geometry.getAttribute('uv');
    const us = [];
    const vs = [];
    for (let i = face * 4; i < face * 4 + 4; i++) {
      us.push(uv.getX(i));
      vs.push(uv.getY(i));
    }
    return [Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs)];
  };

  it('stretches nothing on a one-unit cube', () => {
    const cube = tileBoxUVs(new THREE.BoxGeometry(1, 1, 1), 1, 1, 1);
    for (let face = 0; face < 6; face++) expect(spanOf(cube, face)).toEqual([1, 1]);
  });

  it('gives a tall wall more bricks rather than taller ones', () => {
    // The bug this exists for: BoxGeometry lays 0..1 UVs on every face whatever size
    // the box is, so the 1.6-tall wall along a plateau edge used to wear bricks 60%
    // taller than the 1.0 wall beside it.
    const wall = tileBoxUVs(new THREE.BoxGeometry(1, 2, 1), 1, 2, 1);
    // The four sides span two tiles vertically...
    for (const face of [0, 1, 4, 5]) expect(spanOf(wall, face)).toEqual([1, 2]);
    // ...and the two caps are still one tile square, being a unit across either way.
    for (const face of [2, 3]) expect(spanOf(wall, face)).toEqual([1, 1]);
  });

  it('leaves a geometry it does not understand untouched', () => {
    // Anything that is not an unsegmented box has a different UV layout, and
    // rewriting it by index would scramble it.
    const sphere = new THREE.SphereGeometry(1, 8, 6);
    const before = Array.from(sphere.getAttribute('uv').array);
    tileBoxUVs(sphere, 1, 1, 1);
    expect(Array.from(sphere.getAttribute('uv').array)).toEqual(before);
  });
});
