import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { buildFreeXTreeLayout } from './freeXLayout';
import { cardCenter } from './treeGeometry';
import {
  getCloseFamilyPath,
  getFamilyBusHighlightSegments,
  isDistantCouple,
  routeConnections,
} from './connectionRouter';

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
    const layout = buildFreeXTreeLayout(people, relationships);
    const routed = routeConnections(layout, relationships);
    const family = routed.familyConnections[0];

    expect(routed.coupleConnections).toHaveLength(1);
    expect(family.paths).toHaveLength(4);
    expect(family.paths.some((value) => value.endsWith(`V ${layout.positions.get('child-a').y}`))).toBe(true);
    expect(family.paths.some((value) => value.endsWith(`V ${layout.positions.get('child-b').y}`))).toBe(true);

    const childAHighlight = getFamilyBusHighlightSegments(family, new Set(['child-a']));
    expect(childAHighlight).toEqual([{
      childId: 'child-a',
      fromX: family.sourceX,
      toX: cardCenter(layout.positions.get('child-a')).x,
      path: `M ${family.sourceX} ${family.busY} H ${cardCenter(layout.positions.get('child-a')).x}`,
    }]);
    expect(getFamilyBusHighlightSegments(family, new Set(['child-a', 'child-b']))).toEqual([]);
  });

  it('does not draw a line for a direct sibling relationship', () => {
    const people = ['a', 'b'].map(person);
    const relationships = [{ id: 's', type: 'sibling', personAId: 'a', personBId: 'b' }];
    const layout = buildFreeXTreeLayout(people, relationships);
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
    const layout = buildFreeXTreeLayout(people, relationships);
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

  it('marks a couple as distant when another card stands between the partners', () => {
    const layout = {
      positions: new Map([
        ['a', { x: 0, y: 0, width: 232, height: 112 }],
        ['between', { x: 272, y: 0, width: 232, height: 112 }],
        ['b', { x: 544, y: 0, width: 232, height: 112 }],
      ]),
      generations: new Map([['a', 0], ['between', 0], ['b', 0]]),
    };

    expect(isDistantCouple(layout, 'a', 'b')).toBe(true);
  });

  it('routes a distant couple outside the card row', () => {
    const layout = {
      positions: new Map([
        ['a', { x: 0, y: 0, width: 232, height: 112 }],
        ['between', { x: 272, y: 0, width: 232, height: 112 }],
        ['b', { x: 544, y: 0, width: 232, height: 112 }],
      ]),
      generations: new Map([['a', 0], ['between', 0], ['b', 0]]),
      familyUnits: [{
        id: 'family:a|b',
        kind: 'family',
        partners: ['a', 'b'],
        children: [],
        relationshipId: 'couple',
        relationshipType: 'spouse',
      }],
      parentFamilyByPerson: new Map(),
    };
    const routed = routeConnections(layout, [
      { id: 'couple', type: 'spouse', personAId: 'a', personBId: 'b' },
    ]);
    const connection = routed.coupleConnections[0];

    expect(connection.distant).toBe(true);
    expect(connection.routeSide).toBe('above');
    expect(connection.channelY).toBeLessThan(0);
    expect(connection.path).toBe('M 116 0 V -72 H 660 V 0');
  });

  it('keeps an adjacent couple in the regular line style', () => {
    const layout = {
      positions: new Map([
        ['a', { x: 0, y: 0, width: 232, height: 112 }],
        ['b', { x: 256, y: 0, width: 232, height: 112 }],
      ]),
      generations: new Map([['a', 0], ['b', 0]]),
    };

    expect(isDistantCouple(layout, 'a', 'b')).toBe(false);
  });

  it('collects only parents, spouses, and children for the hovered person', () => {
    const people = [
      'great-grandmother', 'great-grandfather',
      'grandmother', 'grandfather',
      'mother', 'father', 'child', 'sibling',
    ].map(person);
    const relationships = [
      { id: 'great-grandparents', type: 'spouse', personAId: 'great-grandmother', personBId: 'great-grandfather' },
      { id: 'ggm-grandmother', type: 'parent-child', parentId: 'great-grandmother', childId: 'grandmother' },
      { id: 'ggf-grandmother', type: 'parent-child', parentId: 'great-grandfather', childId: 'grandmother' },
      { id: 'grandparents', type: 'spouse', personAId: 'grandmother', personBId: 'grandfather' },
      { id: 'gm-mother', type: 'parent-child', parentId: 'grandmother', childId: 'mother' },
      { id: 'gf-mother', type: 'parent-child', parentId: 'grandfather', childId: 'mother' },
      { id: 'parents', type: 'spouse', personAId: 'mother', personBId: 'father' },
      { id: 'm-child', type: 'parent-child', parentId: 'mother', childId: 'child' },
      { id: 'f-child', type: 'parent-child', parentId: 'father', childId: 'child' },
      { id: 'm-sibling', type: 'parent-child', parentId: 'mother', childId: 'sibling' },
      { id: 'f-sibling', type: 'parent-child', parentId: 'father', childId: 'sibling' },
    ];
    const layout = buildFreeXTreeLayout(people, relationships);
    const closeFamily = getCloseFamilyPath(layout, 'mother');

    expect(closeFamily.familyIds).toEqual(new Set([
      'family:father|mother',
      'family:grandfather|grandmother',
    ]));
    expect(closeFamily.coupleIds).toEqual(new Set(['grandparents', 'parents']));
    expect(closeFamily.childIdsByFamily.get('family:father|mother'))
      .toEqual(new Set(['child', 'sibling']));
    expect(closeFamily.childIdsByFamily.get('family:grandfather|grandmother'))
      .toEqual(new Set(['mother']));
    expect(closeFamily.familyIds.has('family:great-grandfather|great-grandmother')).toBe(false);
    expect(closeFamily.coupleIds.has('great-grandparents')).toBe(false);
  });
});
