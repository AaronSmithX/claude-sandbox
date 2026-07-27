import { describe, it, expect, vi } from 'vitest';
import { Inventory } from '../src/inventory.js';

describe('Inventory', () => {
  it('starts empty', () => {
    const inv = new Inventory();
    expect(inv.keyCount('gold')).toBe(0);
    expect(inv.hasTube).toBe(false);
    expect(inv.won).toBe(false);
    expect(inv.dead).toBe(false);
  });

  it('counts keys per colour', () => {
    const inv = new Inventory();
    inv.addKey('gold');
    inv.addKey('gold');
    inv.addKey('violet');
    expect(inv.keyCount('gold')).toBe(2);
    expect(inv.keyCount('violet')).toBe(1);
    expect(inv.keyCount('white')).toBe(0);
  });

  it('reports zero for a colour it has never heard of', () => {
    expect(new Inventory().keyCount('chartreuse')).toBe(0);
  });

  it('spends one key at a time', () => {
    const inv = new Inventory();
    inv.addKey('white');
    expect(inv.useKey('white')).toBe(true);
    expect(inv.keyCount('white')).toBe(0);
  });

  it('refuses to spend a key it does not have, and never goes negative', () => {
    const inv = new Inventory();
    expect(inv.useKey('gold')).toBe(false);
    expect(inv.keyCount('gold')).toBe(0);
  });

  it('clears everything on reset', () => {
    const inv = new Inventory();
    inv.addKey('gold');
    inv.setTube(true);
    inv.setWon(true);
    inv.setDead(true);

    inv.reset();

    expect(inv.keyCount('gold')).toBe(0);
    expect(inv.hasTube).toBe(false);
    expect(inv.won).toBe(false);
    expect(inv.dead).toBe(false);
  });

  it('notifies on every change, so the HUD can follow along', () => {
    const inv = new Inventory();
    const onChange = vi.fn();
    inv.onChange = onChange;

    inv.addKey('gold');
    inv.useKey('gold');
    inv.setTube(true);
    inv.setWon(true);

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange).toHaveBeenLastCalledWith(inv);
  });

  it('does not notify for a key it could not spend', () => {
    const inv = new Inventory();
    const onChange = vi.fn();
    inv.onChange = onChange;
    inv.useKey('gold');
    expect(onChange).not.toHaveBeenCalled();
  });
});
