import { describe, expect, it } from 'vitest';
import { snapFreeXPosition } from './freeXDrag';

const position = (x) => ({ x, y: 56, width: 232, height: 112 });
const layout = (entries, parentFamilies = []) => ({
  positions: new Map(entries.map(([id, x]) => [id, position(x)])),
  generations: new Map(entries.map(([id]) => [id, 0])),
  parentFamilyByPerson: new Map(parentFamilies),
});

describe('free X drag snapping', () => {
  it('snaps an active spouse to a 256px center distance', () => {
    const result = snapFreeXPosition({
      layout: layout([['a', 0], ['b', 500]]),
      relationships: [{ id: 'pair', type: 'spouse', personAId: 'a', personBId: 'b' }],
      personId: 'b',
      proposedX: 273,
    });

    expect(result.x).toBe(256);
    expect(result.targetDistance).toBe(256);
    expect(result.snappedToPersonId).toBe('a');
  });

  it('snaps siblings to a 272px center distance', () => {
    const result = snapFreeXPosition({
      layout: layout([['a', 0], ['b', 500]], [['a', 'family'], ['b', 'family']]),
      relationships: [],
      personId: 'b',
      proposedX: 286,
    });

    expect(result.x).toBe(272);
    expect(result.targetDistance).toBe(272);
  });

  it('does not snap beyond 20px or to a non-neighboring relative', () => {
    const relationships = [
      { id: 'pair', type: 'spouse', personAId: 'a', personBId: 'c' },
    ];
    const currentLayout = layout([['a', 0], ['between', 250], ['c', 700]]);

    expect(snapFreeXPosition({
      layout: currentLayout,
      relationships,
      personId: 'c',
      proposedX: 290,
    })).toEqual({ x: 290, snappedToPersonId: null });
    expect(snapFreeXPosition({
      layout: layout([['a', 0], ['c', 700]]),
      relationships,
      personId: 'c',
      proposedX: 276,
    }).x).toBe(256);
  });

  it('keeps snapping within the dragged generation', () => {
    const currentLayout = layout([['a', 0], ['b', 500]]);
    currentLayout.generations.set('a', -1);
    const result = snapFreeXPosition({
      layout: currentLayout,
      relationships: [{ id: 'pair', type: 'spouse', personAId: 'a', personBId: 'b' }],
      personId: 'b',
      proposedX: 260,
    });

    expect(result).toEqual({ x: 260, snappedToPersonId: null });
  });
});
