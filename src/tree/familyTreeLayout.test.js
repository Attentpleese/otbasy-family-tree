import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { calculateLayout, cardCenter, TREE_CARD_HEIGHT } from './familyTreeLayout';

const person = (id, firstName = id.toUpperCase()) => createEmptyPerson({ id, firstName });

const expectNoRowOverlaps = (layout) => {
  const rows = new Map();
  layout.positions.forEach((position) => {
    rows.set(position.y, [...(rows.get(position.y) || []), position]);
  });
  rows.forEach((row) => {
    const sorted = row.sort((a, b) => a.x - b.x);
    sorted.slice(1).forEach((position, index) => {
      expect(position.x).toBeGreaterThanOrEqual(sorted[index].x + sorted[index].width);
    });
  });
};

describe('family tree layout', () => {
  it('rebuilds generations from the current graph', () => {
    const people = ['parent', 'selected', 'spouse', 'child'].map(person);
    const relationships = [
      { id: 'p', type: 'parent-child', parentId: 'parent', childId: 'selected' },
      { id: 's', type: 'spouse', personAId: 'selected', personBId: 'spouse' },
      { id: 'c', type: 'parent-child', parentId: 'selected', childId: 'child' },
    ];
    const layout = calculateLayout(people, relationships);

    expect(layout.positions.get('selected').y).toBeGreaterThan(layout.positions.get('parent').y);
    expect(layout.positions.get('spouse').y).toBe(layout.positions.get('selected').y);
    expect(layout.positions.get('child').y).toBeGreaterThan(layout.positions.get('selected').y);
    expectNoRowOverlaps(layout);
  });

  it('reserves independent ancestry zones on both sides of a three-generation tree', () => {
    const people = ['child', 'mother', 'father', 'mm', 'mf', 'fm', 'ff'].map(person);
    const relationships = [
      { id: 'parents', type: 'spouse', personAId: 'mother', personBId: 'father' },
      { id: 'maternal', type: 'spouse', personAId: 'mm', personBId: 'mf' },
      { id: 'paternal', type: 'spouse', personAId: 'fm', personBId: 'ff' },
      ...['mother', 'father'].map((parentId) => ({ id: `${parentId}-child`, type: 'parent-child', parentId, childId: 'child' })),
      ...['mm', 'mf'].map((parentId) => ({ id: `${parentId}-mother`, type: 'parent-child', parentId, childId: 'mother' })),
      ...['fm', 'ff'].map((parentId) => ({ id: `${parentId}-father`, type: 'parent-child', parentId, childId: 'father' })),
    ];
    const layout = calculateLayout(people, relationships);

    expect(new Set(['mm', 'mf', 'fm', 'ff'].map((id) => layout.positions.get(id).y))).toHaveLength(1);
    expect(layout.positions.get('mother').y).toBe(layout.positions.get('father').y);
    expect(layout.positions.get('child').y).toBeGreaterThan(layout.positions.get('mother').y);
    expectNoRowOverlaps(layout);
  });

  it('keeps siblings compact while reserving room for a deeper child branch', () => {
    const people = ['parent', 'a', 'b', 'c', 'd', 'b1', 'b2'].map(person);
    const relationships = [
      ...['a', 'b', 'c', 'd'].map((childId) => ({ id: `p-${childId}`, type: 'parent-child', parentId: 'parent', childId })),
      { id: 'b-b1', type: 'parent-child', parentId: 'b', childId: 'b1' },
      { id: 'b-b2', type: 'parent-child', parentId: 'b', childId: 'b2' },
    ];
    const layout = calculateLayout(people, relationships);
    const children = ['a', 'b', 'c', 'd'].map((id) => layout.positions.get(id)).sort((a, b) => a.x - b.x);

    expect(new Set(children.map((position) => position.y))).toHaveLength(1);
    const gaps = children.slice(1).map((position, index) => position.x - (children[index].x + children[index].width));
    expect(Math.max(...gaps)).toBeLessThan(500);
    expectNoRowOverlaps(layout);
  });

  it('places direct siblings together without changing generation', () => {
    const people = ['first', 'second', 'third'].map(person);
    const relationships = [
      { id: 's1', type: 'sibling', personAId: 'first', personBId: 'second' },
      { id: 's2', type: 'sibling', personAId: 'second', personBId: 'third' },
    ];
    const layout = calculateLayout(people, relationships);

    expect(new Set(people.map(({ id }) => layout.positions.get(id).y))).toHaveLength(1);
    expectNoRowOverlaps(layout);
  });

  it('supports repeat marriages and measured long-name widths', () => {
    const people = ['a', 'b', 'c', 'ab-child', 'ac-child'].map(person);
    const relationships = [
      { id: 'ab', type: 'spouse', personAId: 'a', personBId: 'b' },
      { id: 'ac', type: 'partner', personAId: 'a', personBId: 'c' },
      { id: 'ab-a', type: 'parent-child', parentId: 'a', childId: 'ab-child' },
      { id: 'ab-b', type: 'parent-child', parentId: 'b', childId: 'ab-child' },
      { id: 'ac-a', type: 'parent-child', parentId: 'a', childId: 'ac-child' },
      { id: 'ac-c', type: 'parent-child', parentId: 'c', childId: 'ac-child' },
    ];
    const layout = calculateLayout(people, relationships, {
      nodeWidths: new Map([['a', 330], ['b', 214], ['c', 270]]),
    });

    expect(layout.positions.get('a').width).toBe(330);
    expect(layout.positions.get('a').y).toBe(layout.positions.get('b').y);
    expect(layout.positions.get('a').y).toBe(layout.positions.get('c').y);
    expect(layout.positions.get('ab-child').y).toBeGreaterThanOrEqual(
      layout.positions.get('a').y + TREE_CARD_HEIGHT,
    );
    expectNoRowOverlaps(layout);
    expect(Number.isFinite(cardCenter(layout.positions.get('ac-child')).x)).toBe(true);
  });
});
