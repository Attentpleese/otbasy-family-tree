import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { buildFamilyTreeLayout, getChildConnectionGeometry, TREE_CARD_HEIGHT } from './familyTreeLayout';

const person = (id) => createEmptyPerson({ id, firstName: id.toUpperCase() });

describe('family tree layout', () => {
  it('recomputes all generations after adding a parent, spouse and child', () => {
    const people = [person('selected'), person('parent'), person('spouse'), person('child')];
    const relationships = [
      { id: 'parent-link', type: 'parent-child', parentId: 'parent', childId: 'selected' },
      { id: 'spouse-link', type: 'spouse', personAId: 'selected', personBId: 'spouse' },
      { id: 'child-link', type: 'parent-child', parentId: 'selected', childId: 'child' },
    ];

    const layout = buildFamilyTreeLayout(people, relationships);
    const parentY = layout.positions.get('parent').y;
    const selectedY = layout.positions.get('selected').y;
    const spouseY = layout.positions.get('spouse').y;
    const childY = layout.positions.get('child').y;

    expect(selectedY).toBeGreaterThanOrEqual(parentY + TREE_CARD_HEIGHT);
    expect(spouseY).toBe(selectedY);
    expect(childY).toBeGreaterThanOrEqual(selectedY + TREE_CARD_HEIGHT);
    expect(layout.childConnections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentIds: ['parent'], childrenIds: ['selected'] }),
        expect.objectContaining({ parentIds: ['selected'], childrenIds: ['child'] }),
      ]),
    );
  });

  it('does not produce child-line geometry for cards without children', () => {
    const layout = buildFamilyTreeLayout(
      [person('a'), person('b')],
      [{ id: 'couple', type: 'spouse', personAId: 'a', personBId: 'b' }],
    );

    expect(layout.coupleConnections).toHaveLength(1);
    expect(layout.childConnections).toHaveLength(0);
  });

  it('returns fresh positions and connections when the graph changes', () => {
    const initial = buildFamilyTreeLayout([person('a')], []);
    const updated = buildFamilyTreeLayout(
      [person('a'), person('child'), person('z-root')],
      [{ id: 'link', type: 'parent-child', parentId: 'a', childId: 'child' }],
    );

    expect(initial.positions.has('child')).toBe(false);
    expect(updated.positions.get('child').y).toBeGreaterThan(updated.positions.get('a').y);
    expect(updated.childConnections).toHaveLength(1);
    const geometry = getChildConnectionGeometry(updated.childConnections[0], updated.positions);
    expect(geometry.maxBranchX).toBeGreaterThan(geometry.minBranchX);
  });
});
