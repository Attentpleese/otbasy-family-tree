import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import {
  calculateLayout,
  cardCenter,
  ISLAND_GAP,
  packIslands,
  PARTNER_GAP,
  SIBLING_GAP,
  TREE_CARD_HEIGHT,
  TREE_CARD_WIDTH,
} from './familyTreeLayout';

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
  it('keeps the legacy layout bit-for-bit identical when every persisted group order is null', () => {
    const people = ['parent-a', 'parent-b', 'child-a', 'child-b', 'partner'].map(person);
    const relationships = [
      { id: 'parents', type: 'spouse', personAId: 'parent-a', personBId: 'parent-b' },
      ...['child-a', 'child-b'].flatMap((childId) => [
        { id: `parent-a-${childId}`, type: 'parent-child', parentId: 'parent-a', childId },
        { id: `parent-b-${childId}`, type: 'parent-child', parentId: 'parent-b', childId },
      ]),
      { id: 'child-partner', type: 'spouse', personAId: 'child-a', personBId: 'partner' },
    ];
    const legacy = calculateLayout(
      people.map(({ familyLayoutOrder: _familyLayoutOrder, ...item }) => item),
      relationships,
    );
    const explicitNull = calculateLayout(
      people.map((item) => ({ ...item, familyLayoutOrder: null })),
      relationships,
    );
    const computedLayout = ({ people: _people, ...layout }) => layout;

    expect(computedLayout(explicitNull)).toEqual(computedLayout(legacy));
  });

  it('uses persisted order between native row groups in the same generation', () => {
    const people = [
      ...['a-1', 'a-2'].map((id) => ({ ...person(id), familyLayoutOrder: 1 })),
      ...['b-1', 'b-2'].map((id) => ({ ...person(id), familyLayoutOrder: 0 })),
    ];
    const relationships = [
      { id: 'a-siblings', type: 'sibling', personAId: 'a-1', personBId: 'a-2' },
      { id: 'b-siblings', type: 'sibling', personAId: 'b-1', personBId: 'b-2' },
      { id: 'cross-couple', type: 'spouse', personAId: 'a-1', personBId: 'b-1' },
    ];
    const layout = calculateLayout(people, relationships);
    const center = (id) => cardCenter(layout.positions.get(id)).x;

    expect(Math.max(center('b-1'), center('b-2')))
      .toBeLessThan(Math.min(center('a-1'), center('a-2')));
    expectNoRowOverlaps(layout);
  });

  it('does not let strict parent anchors or partner compaction invert persisted group order', () => {
    const people = [
      { ...person('father'), familyLayoutOrder: 1 },
      { ...person('mother'), familyLayoutOrder: 0 },
      person('child'),
      person('father-parent-a'),
      person('father-parent-b'),
      person('mother-parent-a'),
      person('mother-parent-b'),
    ];
    const relationships = [
      { id: 'parents', type: 'spouse', personAId: 'father', personBId: 'mother' },
      { id: 'father-child', type: 'parent-child', parentId: 'father', childId: 'child' },
      { id: 'mother-child', type: 'parent-child', parentId: 'mother', childId: 'child' },
      { id: 'father-parents', type: 'spouse', personAId: 'father-parent-a', personBId: 'father-parent-b' },
      { id: 'fpa-father', type: 'parent-child', parentId: 'father-parent-a', childId: 'father' },
      { id: 'fpb-father', type: 'parent-child', parentId: 'father-parent-b', childId: 'father' },
      { id: 'mother-parents', type: 'spouse', personAId: 'mother-parent-a', personBId: 'mother-parent-b' },
      { id: 'mpa-mother', type: 'parent-child', parentId: 'mother-parent-a', childId: 'mother' },
      { id: 'mpb-mother', type: 'parent-child', parentId: 'mother-parent-b', childId: 'mother' },
    ];
    const layout = calculateLayout(people, relationships);
    const fatherCenter = cardCenter(layout.positions.get('father')).x;
    const motherCenter = cardCenter(layout.positions.get('mother')).x;

    expect(motherCenter).toBeLessThan(fatherCenter);
    expect(fatherCenter - motherCenter).toBe(TREE_CARD_WIDTH + PARTNER_GAP);
    expectNoRowOverlaps(layout);
  });

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
    const [left, right] = ['first', 'second']
      .map((id) => layout.positions.get(id))
      .sort((a, b) => a.x - b.x);
    expect(right.x - (left.x + left.width)).toBe(SIBLING_GAP);
    expectNoRowOverlaps(layout);
  });

  it('uses only the minimum gap for people without descendant branches', () => {
    const unrelated = calculateLayout([person('a'), person('b')], []);
    const unrelatedCards = [...unrelated.positions.values()].sort((a, b) => a.x - b.x);
    expect(unrelatedCards[1].x - (unrelatedCards[0].x + unrelatedCards[0].width)).toBe(ISLAND_GAP);

    const partners = calculateLayout(
      [person('partner-a'), person('partner-b')],
      [{ id: 'couple', type: 'spouse', personAId: 'partner-a', personBId: 'partner-b' }],
    );
    const partnerCards = [...partners.positions.values()].sort((a, b) => a.x - b.x);
    expect(partnerCards[1].x - (partnerCards[0].x + partnerCards[0].width)).toBe(PARTNER_GAP);
  });

  it('supports repeat marriages with one fixed card width', () => {
    const people = ['a', 'b', 'c', 'ab-child', 'ac-child'].map(person);
    const relationships = [
      { id: 'ab', type: 'spouse', personAId: 'a', personBId: 'b' },
      { id: 'ac', type: 'partner', personAId: 'a', personBId: 'c' },
      { id: 'ab-a', type: 'parent-child', parentId: 'a', childId: 'ab-child' },
      { id: 'ab-b', type: 'parent-child', parentId: 'b', childId: 'ab-child' },
      { id: 'ac-a', type: 'parent-child', parentId: 'a', childId: 'ac-child' },
      { id: 'ac-c', type: 'parent-child', parentId: 'c', childId: 'ac-child' },
    ];
    const layout = calculateLayout(people, relationships);

    expect([...layout.positions.values()].every(({ width }) => width === TREE_CARD_WIDTH)).toBe(true);
    expect(layout.positions.get('a').y).toBe(layout.positions.get('b').y);
    expect(layout.positions.get('a').y).toBe(layout.positions.get('c').y);
    expect(layout.positions.get('ab-child').y).toBeGreaterThanOrEqual(
      layout.positions.get('a').y + TREE_CARD_HEIGHT,
    );
    expectNoRowOverlaps(layout);
    expect(Number.isFinite(cardCenter(layout.positions.get('ac-child')).x)).toBe(true);
  });

  it('anchors disconnected components independently when later parents are added', () => {
    const leftRoot = { ...person('left-root'), createdAt: '2020-01-01T00:00:00.000Z' };
    const leftPartner = { ...person('left-partner'), createdAt: '2020-01-01T00:00:01.000Z' };
    const leftChild = { ...person('left-child'), createdAt: '2020-01-01T00:00:02.000Z' };
    const newMother = { ...person('new-mother'), createdAt: '2020-01-01T00:00:03.000Z' };
    const basePeople = [leftRoot, leftPartner, leftChild, newMother];
    const baseRelationships = [
      { id: 'left-couple', type: 'spouse', personAId: 'left-root', personBId: 'left-partner' },
      { id: 'left-a-child', type: 'parent-child', parentId: 'left-root', childId: 'left-child' },
      { id: 'left-b-child', type: 'parent-child', parentId: 'left-partner', childId: 'left-child' },
    ];
    const before = calculateLayout(basePeople, baseRelationships);
    const after = calculateLayout([
      ...basePeople,
      { ...person('new-grandmother'), createdAt: '2020-01-01T00:00:04.000Z' },
      { ...person('new-grandfather'), createdAt: '2020-01-01T00:00:05.000Z' },
    ], [
      ...baseRelationships,
      { id: 'new-parents', type: 'spouse', personAId: 'new-grandmother', personBId: 'new-grandfather' },
      { id: 'new-a-mother', type: 'parent-child', parentId: 'new-grandmother', childId: 'new-mother' },
      { id: 'new-b-mother', type: 'parent-child', parentId: 'new-grandfather', childId: 'new-mother' },
    ]);

    expect(after.generations.get('left-root')).toBe(before.generations.get('left-root'));
    expect(after.generations.get('left-child')).toBe(before.generations.get('left-child'));
    expect(after.generations.get('new-mother')).toBe(0);
    expect(after.generations.get('new-grandmother')).toBe(-1);
    expect(after.generations.get('new-grandfather')).toBe(-1);
    expect(after.componentAnchors).toEqual(['left-root', 'new-mother']);
    expect(after.islandBounds[1].left - after.islandBounds[0].right).toBe(ISLAND_GAP);
  });

  it('packs disconnected islands into non-overlapping stable horizontal zones', () => {
    const positions = new Map([
      ['real-a', { x: -120, y: 0, width: 220, height: 112 }],
      ['real-b', { x: 140, y: 0, width: 220, height: 112 }],
      ['test-a', { x: -60, y: 0, width: 220, height: 112 }],
      ['test-b', { x: 200, y: 0, width: 220, height: 112 }],
    ]);
    const islands = [
      { id: 'real', personIds: ['real-a', 'real-b'] },
      { id: 'test', personIds: ['test-a', 'test-b'] },
    ];

    const packed = packIslands(positions, islands);

    expect(packed[1].left - packed[0].right).toBe(ISLAND_GAP);
    expect(positions.get('test-a').x).toBeGreaterThan(positions.get('real-b').x + positions.get('real-b').width);

    const sameWidthPositions = new Map([
      ['real-a', { x: -80, y: 0, width: 220, height: 112 }],
      ['real-b', { x: 180, y: 0, width: 220, height: 112 }],
      ['test-a', { x: 20, y: 0, width: 220, height: 112 }],
      ['test-b', { x: 280, y: 0, width: 220, height: 112 }],
    ]);
    const repacked = packIslands(sameWidthPositions, islands);

    expect(repacked.map(({ left, right, width }) => ({ left, right, width }))).toEqual(
      packed.map(({ left, right, width }) => ({ left, right, width })),
    );
  });

  it('strictly anchors the child member of a spouse block under the actual parent family', () => {
    const people = [
      'top-mother', 'top-father', 'placeholder',
      'right-mother', 'right-father', 'maria', 'zhuman',
      'magipar', 'sabikan', 'qaua', 'qabdygali',
    ].map(person);
    const relationships = [
      { id: 'top-pair', type: 'spouse', personAId: 'top-mother', personBId: 'top-father' },
      { id: 'top-a-placeholder', type: 'parent-child', parentId: 'top-mother', childId: 'placeholder' },
      { id: 'top-b-placeholder', type: 'parent-child', parentId: 'top-father', childId: 'placeholder' },
      { id: 'placeholder-magipar', type: 'parent-child', parentId: 'placeholder', childId: 'magipar' },
      { id: 'magipar-pair', type: 'spouse', personAId: 'magipar', personBId: 'sabikan' },
      { id: 'right-pair', type: 'spouse', personAId: 'right-mother', personBId: 'right-father' },
      { id: 'right-a-maria', type: 'parent-child', parentId: 'right-mother', childId: 'maria' },
      { id: 'right-b-maria', type: 'parent-child', parentId: 'right-father', childId: 'maria' },
      { id: 'maria-pair', type: 'spouse', personAId: 'zhuman', personBId: 'maria' },
      { id: 'magipar-qaua', type: 'parent-child', parentId: 'magipar', childId: 'qaua' },
      { id: 'sabikan-qaua', type: 'parent-child', parentId: 'sabikan', childId: 'qaua' },
      { id: 'zhuman-qabdygali', type: 'parent-child', parentId: 'zhuman', childId: 'qabdygali' },
      { id: 'maria-qabdygali', type: 'parent-child', parentId: 'maria', childId: 'qabdygali' },
      { id: 'children-pair', type: 'spouse', personAId: 'qaua', personBId: 'qabdygali' },
    ];
    const layout = calculateLayout(people, relationships);
    const center = (id) => cardCenter(layout.positions.get(id)).x;
    const expectAnchored = (childId, parentIds) => {
      const parentCenter = parentIds.reduce((sum, id) => sum + center(id), 0) / parentIds.length;
      expect(center(childId)).toBeCloseTo(parentCenter, 8);
    };

    expectAnchored('placeholder', ['top-mother', 'top-father']);
    expectAnchored('magipar', ['placeholder']);
    expectAnchored('maria', ['right-mother', 'right-father']);
    expectNoRowOverlaps(layout);
  });

  it('keeps each partner in their native sibling group and centers both groups', () => {
    const people = [
      'root', 'father', 'mother',
      'paternal-grandfather', 'paternal-grandmother',
      'maternal-grandfather', 'maternal-grandmother',
      'paternal-sibling',
    ].map((id, index) => ({
      ...person(id),
      createdAt: `2020-01-01T00:00:0${index}.000Z`,
    }));
    const relationships = [
      { id: 'parents', type: 'spouse', personAId: 'father', personBId: 'mother' },
      { id: 'father-root', type: 'parent-child', parentId: 'father', childId: 'root' },
      { id: 'mother-root', type: 'parent-child', parentId: 'mother', childId: 'root' },
      { id: 'paternal-pair', type: 'spouse', personAId: 'paternal-grandfather', personBId: 'paternal-grandmother' },
      { id: 'paternal-grandfather-father', type: 'parent-child', parentId: 'paternal-grandfather', childId: 'father' },
      { id: 'paternal-grandmother-father', type: 'parent-child', parentId: 'paternal-grandmother', childId: 'father' },
      { id: 'paternal-grandfather-sibling', type: 'parent-child', parentId: 'paternal-grandfather', childId: 'paternal-sibling' },
      { id: 'paternal-grandmother-sibling', type: 'parent-child', parentId: 'paternal-grandmother', childId: 'paternal-sibling' },
      { id: 'maternal-pair', type: 'spouse', personAId: 'maternal-grandfather', personBId: 'maternal-grandmother' },
      { id: 'maternal-grandfather-mother', type: 'parent-child', parentId: 'maternal-grandfather', childId: 'mother' },
      { id: 'maternal-grandmother-mother', type: 'parent-child', parentId: 'maternal-grandmother', childId: 'mother' },
    ];
    const layout = calculateLayout(people, relationships);
    const center = (id) => cardCenter(layout.positions.get(id)).x;
    const partnerRow = ['paternal-sibling', 'father', 'mother']
      .sort((a, b) => layout.positions.get(a).x - layout.positions.get(b).x);
    const paternalParentCenter = (center('paternal-grandfather') + center('paternal-grandmother')) / 2;
    const paternalChildrenCenter = (center('paternal-sibling') + center('father')) / 2;
    const maternalParentCenter = (center('maternal-grandfather') + center('maternal-grandmother')) / 2;

    expect(partnerRow).toEqual(['father', 'paternal-sibling', 'mother']);
    expect(paternalChildrenCenter).toBeCloseTo(paternalParentCenter, 8);
    expect(center('mother')).toBeCloseTo(maternalParentCenter, 8);
    expectNoRowOverlaps(layout);
  });

  it('keeps an adjacent married pair compact when both partners have known parents', () => {
    const people = [
      'father', 'mother', 'child',
      'father-parent-a', 'father-parent-b',
      'mother-parent-a', 'mother-parent-b',
    ].map(person);
    const relationships = [
      { id: 'parents', type: 'spouse', personAId: 'father', personBId: 'mother' },
      { id: 'father-child', type: 'parent-child', parentId: 'father', childId: 'child' },
      { id: 'mother-child', type: 'parent-child', parentId: 'mother', childId: 'child' },
      { id: 'father-parents', type: 'spouse', personAId: 'father-parent-a', personBId: 'father-parent-b' },
      { id: 'fpa-father', type: 'parent-child', parentId: 'father-parent-a', childId: 'father' },
      { id: 'fpb-father', type: 'parent-child', parentId: 'father-parent-b', childId: 'father' },
      { id: 'mother-parents', type: 'spouse', personAId: 'mother-parent-a', personBId: 'mother-parent-b' },
      { id: 'mpa-mother', type: 'parent-child', parentId: 'mother-parent-a', childId: 'mother' },
      { id: 'mpb-mother', type: 'parent-child', parentId: 'mother-parent-b', childId: 'mother' },
    ];
    const layout = calculateLayout(people, relationships);

    expect(Math.abs(cardCenter(layout.positions.get('mother')).x -
      cardCenter(layout.positions.get('father')).x)).toBe(TREE_CARD_WIDTH + PARTNER_GAP);
    expectNoRowOverlaps(layout);
  });
});
