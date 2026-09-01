import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { calculateLayout, cardCenter } from './familyTreeLayout';
import { routeConnections } from './connectionRouter';

const person = (id) => createEmptyPerson({ id, firstName: id });

describe('connection router', () => {
  it('draws one family bus and drops that reach every child card', () => {
    const people = ['mother', 'father', 'child-a', 'child-b'].map(person);
    const relationships = [
      { id: 'couple', type: 'spouse', personAId: 'mother', personBId: 'father' },
      { id: 'ma', type: 'parent-child', parentId: 'mother', childId: 'child-a' },
      { id: 'fa', type: 'parent-child', parentId: 'father', childId: 'child-a' },
      { id: 'mb', type: 'parent-child', parentId: 'mother', childId: 'child-b' },
      { id: 'fb', type: 'parent-child', parentId: 'father', childId: 'child-b' },
    ];
    const layout = calculateLayout(people, relationships);
    const routed = routeConnections(layout, relationships);
    const family = routed.familyConnections[0];

    expect(routed.coupleConnections).toHaveLength(1);
    expect(family.paths).toHaveLength(4);
    expect(family.paths.some((value) => value.endsWith(`V ${layout.positions.get('child-a').y}`))).toBe(true);
    expect(family.paths.some((value) => value.endsWith(`V ${layout.positions.get('child-b').y}`))).toBe(true);
  });

  it('does not draw a line for a direct sibling relationship', () => {
    const people = ['a', 'b'].map(person);
    const relationships = [{ id: 's', type: 'sibling', personAId: 'a', personBId: 'b' }];
    const layout = calculateLayout(people, relationships);
    const routed = routeConnections(layout, relationships);

    expect(cardCenter(layout.positions.get('a')).y).toBe(cardCenter(layout.positions.get('b')).y);
    expect(routed.coupleConnections).toHaveLength(0);
    expect(routed.familyConnections).toHaveLength(0);
  });

  it('connects the child bus to the final center of a constrained partner pair', () => {
    const people = ['grandmother', 'grandfather', 'magdan', 'nurgul', 'azhar', 'daulet'].map(person);
    const relationships = [
      { id: 'grandparents', type: 'spouse', personAId: 'grandmother', personBId: 'grandfather' },
      { id: 'gm-magdan', type: 'parent-child', parentId: 'grandmother', childId: 'magdan' },
      { id: 'gf-magdan', type: 'parent-child', parentId: 'grandfather', childId: 'magdan' },
      { id: 'parents', type: 'spouse', personAId: 'magdan', personBId: 'nurgul' },
      { id: 'm-azhar', type: 'parent-child', parentId: 'magdan', childId: 'azhar' },
      { id: 'n-azhar', type: 'parent-child', parentId: 'nurgul', childId: 'azhar' },
      { id: 'm-daulet', type: 'parent-child', parentId: 'magdan', childId: 'daulet' },
      { id: 'n-daulet', type: 'parent-child', parentId: 'nurgul', childId: 'daulet' },
    ];
    const layout = calculateLayout(people, relationships);
    const routed = routeConnections(layout, relationships);
    const family = routed.familyConnections.find((item) => item.id === 'family:magdan|nurgul');
    const magdanX = cardCenter(layout.positions.get('magdan')).x;
    const nurgulX = cardCenter(layout.positions.get('nurgul')).x;
    const expectedUnionX = (magdanX + nurgulX) / 2;
    const busNumbers = family.paths[1].match(/-?\d+(?:\.\d+)?/g).map(Number);
    const [busStartX, , busEndX] = busNumbers;

    expect(family.sourceX).toBeCloseTo(expectedUnionX, 8);
    expect(family.paths[0]).toBe(`M ${expectedUnionX} ${family.sourceY} V ${family.busY}`);
    expect(busStartX).toBeLessThanOrEqual(expectedUnionX);
    expect(busEndX).toBeGreaterThanOrEqual(expectedUnionX);
  });
});
