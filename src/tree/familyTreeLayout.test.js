import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import {
  buildFamilyTreeLayout,
  cardCenter,
  getChildConnectionGeometry,
  getChildConnectionPath,
  TREE_CARD_HEIGHT,
  TREE_CARD_WIDTH,
} from './familyTreeLayout';

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
    expect(geometry.maxBranchX).toBe(geometry.minBranchX);
    expect(getChildConnectionPath(geometry, updated.positions.get('child')))
      .toMatch(new RegExp(`V ${updated.positions.get('child').y}$`));
  });

  it('allocates separate centered ancestry zones for both sides of a three-generation tree', () => {
    const people = ['child', 'mother', 'father', 'mother-mother', 'mother-father', 'father-mother', 'father-father']
      .map(person);
    const relationships = [
      { id: 'parents', type: 'spouse', personAId: 'mother', personBId: 'father' },
      { id: 'mother-parents', type: 'spouse', personAId: 'mother-mother', personBId: 'mother-father' },
      { id: 'father-parents', type: 'spouse', personAId: 'father-mother', personBId: 'father-father' },
      { id: 'mother-child', type: 'parent-child', parentId: 'mother', childId: 'child' },
      { id: 'father-child', type: 'parent-child', parentId: 'father', childId: 'child' },
      { id: 'mm-mother', type: 'parent-child', parentId: 'mother-mother', childId: 'mother' },
      { id: 'mf-mother', type: 'parent-child', parentId: 'mother-father', childId: 'mother' },
      { id: 'fm-father', type: 'parent-child', parentId: 'father-mother', childId: 'father' },
      { id: 'ff-father', type: 'parent-child', parentId: 'father-father', childId: 'father' },
    ];

    const layout = buildFamilyTreeLayout(people, relationships);
    const center = (id) => cardCenter(layout.positions.get(id)).x;
    const maternalCenter = (center('mother-mother') + center('mother-father')) / 2;
    const paternalCenter = (center('father-mother') + center('father-father')) / 2;

    expect(maternalCenter).toBe(center('mother'));
    expect(paternalCenter).toBe(center('father'));
    expect((center('mother') + center('father')) / 2).toBe(center('child'));

    const maternalBounds = [layout.positions.get('mother-mother'), layout.positions.get('mother-father')];
    const paternalBounds = [layout.positions.get('father-mother'), layout.positions.get('father-father')];
    const maternalLeft = Math.min(...maternalBounds.map((position) => position.x));
    const maternalRight = Math.max(...maternalBounds.map((position) => position.x + TREE_CARD_WIDTH));
    const paternalLeft = Math.min(...paternalBounds.map((position) => position.x));
    const paternalRight = Math.max(...paternalBounds.map((position) => position.x + TREE_CARD_WIDTH));
    expect(maternalRight <= paternalLeft || paternalRight <= maternalLeft).toBe(true);

    const parentConnection = layout.childConnections.find((connection) => connection.childrenIds.includes('child'));
    const geometry = getChildConnectionGeometry(parentConnection, layout.positions);
    expect(geometry.sourceY).toBe(cardCenter(layout.positions.get('mother')).y);
    expect(getChildConnectionPath(geometry, layout.positions.get('child')))
      .toMatch(new RegExp(`V ${layout.positions.get('child').y}$`));
  });

  it('keeps siblings compact and reserves only the width needed by deeper child subtrees', () => {
    const people = ['parent', 'child-1', 'child-2', 'child-3', 'child-4', 'grandchild-1', 'grandchild-2']
      .map(person);
    const relationships = [
      ...['child-1', 'child-2', 'child-3', 'child-4'].map((childId, index) => ({
        id: `child-link-${index}`,
        type: 'parent-child',
        parentId: 'parent',
        childId,
      })),
      { id: 'grandchild-link-1', type: 'parent-child', parentId: 'child-2', childId: 'grandchild-1' },
      { id: 'grandchild-link-2', type: 'parent-child', parentId: 'child-2', childId: 'grandchild-2' },
    ];

    const layout = buildFamilyTreeLayout(people, relationships);
    const childPositions = ['child-1', 'child-2', 'child-3', 'child-4']
      .map((id) => layout.positions.get(id))
      .sort((a, b) => a.x - b.x);
    const childGaps = childPositions.slice(1).map((position, index) =>
      position.x - (childPositions[index].x + TREE_CARD_WIDTH));

    expect(new Set(childPositions.map((position) => position.y))).toHaveLength(1);
    expect(Math.max(...childGaps)).toBeLessThan(TREE_CARD_WIDTH);
    expect((childPositions[0].x + childPositions.at(-1).x + TREE_CARD_WIDTH) / 2)
      .toBe(cardCenter(layout.positions.get('parent')).x);
    expect(
      (cardCenter(layout.positions.get('grandchild-1')).x + cardCenter(layout.positions.get('grandchild-2')).x) / 2,
    ).toBe(cardCenter(layout.positions.get('child-2')).x);
  });

  it('places directly linked siblings together without drawing a relationship line', () => {
    const people = [person('first'), person('second')];
    const relationships = [
      { id: 'siblings', type: 'sibling', personAId: 'first', personBId: 'second' },
    ];
    const layout = buildFamilyTreeLayout(people, relationships);
    const first = layout.positions.get('first');
    const second = layout.positions.get('second');

    expect(first.y).toBe(second.y);
    expect(Math.abs(first.x - second.x)).toBe(TREE_CARD_WIDTH + 32);
    expect(layout.coupleConnections).toHaveLength(0);
    expect(layout.childConnections).toHaveLength(0);
  });
});
