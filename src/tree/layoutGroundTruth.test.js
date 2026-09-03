import { describe, expect, it } from 'vitest';
import { calculateLayout, cardCenter, TREE_CARD_WIDTH } from './familyTreeLayout';
import { groundTruthScenario } from './familyScenarios';
import { createEmptyPerson } from '../domain/familyGraph';

const layoutForStep = (step) => {
  const graph = groundTruthScenario(step);
  return calculateLayout(graph.people, graph.relationships);
};

const centerX = (layout, personId) => cardCenter(layout.positions.get(personId)).x;
const familyCenterX = (layout, personIds) =>
  personIds.reduce((sum, personId) => sum + centerX(layout, personId), 0) / personIds.length;

const rowOrder = (layout, personIds) => [...personIds].sort(
  (a, b) => layout.positions.get(a).x - layout.positions.get(b).x,
);

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

describe('layout ground-truth sequence', () => {
  it('preserves the expected geometry through all six editing steps', () => {
    const layouts = Array.from({ length: 6 }, (_, index) => layoutForStep(index + 1));
    const [step1, step2, step3, step4, step5, step6] = layouts;

    expect(step1.positions.size).toBe(1);
    expect(centerX(step1, 'ground-root')).toBeCloseTo(step1.width / 2, 8);

    expect(rowOrder(step2, ['ground-father', 'ground-mother'])).toEqual([
      'ground-father', 'ground-mother',
    ]);
    expect(familyCenterX(step2, ['ground-father', 'ground-mother']))
      .toBeCloseTo(centerX(step2, 'ground-root'), 8);

    expect(familyCenterX(step3, ['ground-paternal-grandfather', 'ground-paternal-grandmother']))
      .toBeCloseTo(centerX(step3, 'ground-father'), 8);

    expect(centerX(step4, 'ground-mother') - centerX(step4, 'ground-father'))
      .toBe(TREE_CARD_WIDTH + 24);
    expect(familyCenterX(step4, ['ground-paternal-grandfather', 'ground-paternal-grandmother']))
      .toBeLessThan(centerX(step4, 'ground-father'));
    expect(familyCenterX(step4, ['ground-maternal-grandfather', 'ground-maternal-grandmother']))
      .toBeGreaterThan(centerX(step4, 'ground-mother'));

    expect(rowOrder(step5, [
      'ground-paternal-sibling', 'ground-father', 'ground-mother',
    ])).toEqual([
      'ground-father', 'ground-paternal-sibling', 'ground-mother',
    ]);
    expect(familyCenterX(step5, ['ground-paternal-grandfather', 'ground-paternal-grandmother']))
      .toBeCloseTo(familyCenterX(step5, ['ground-paternal-sibling', 'ground-father']), 8);

    expect(rowOrder(step6, [
      'ground-paternal-sibling', 'ground-father', 'ground-mother', 'ground-maternal-sibling',
    ])).toEqual([
      'ground-father', 'ground-paternal-sibling', 'ground-mother', 'ground-maternal-sibling',
    ]);
    expect(familyCenterX(step6, ['ground-paternal-grandfather', 'ground-paternal-grandmother']))
      .toBeCloseTo(familyCenterX(step6, ['ground-paternal-sibling', 'ground-father']), 8);
    expect(familyCenterX(step6, ['ground-maternal-grandfather', 'ground-maternal-grandmother']))
      .toBeCloseTo(familyCenterX(step6, ['ground-mother', 'ground-maternal-sibling']), 8);

    [
      'ground-paternal-grandfather',
      'ground-paternal-grandmother',
      'ground-paternal-sibling',
      'ground-father',
    ].forEach((personId) => {
      expect(centerX(step6, personId)).toBeCloseTo(centerX(step5, personId), 8);
    });
    layouts.forEach(expectNoRowOverlaps);
  });

  it('keeps the native sibling group intact when several members marry', () => {
    const ids = [
      'grandfather', 'grandmother',
      'magdan', 'middle-sibling', 'qairtten',
      'nurgul', 'qairtten-spouse',
    ];
    const people = ids.map((id, index) => createEmptyPerson({
      id,
      firstName: id,
      createdAt: `2020-01-01T00:00:0${index}.000Z`,
    }));
    const relationships = [
      { id: 'grandparents', type: 'spouse', personAId: 'grandfather', personBId: 'grandmother' },
      ...['magdan', 'middle-sibling', 'qairtten'].flatMap((childId) => [
        { id: `grandfather-${childId}`, type: 'parent-child', parentId: 'grandfather', childId },
        { id: `grandmother-${childId}`, type: 'parent-child', parentId: 'grandmother', childId },
      ]),
      { id: 'magdan-couple', type: 'spouse', personAId: 'magdan', personBId: 'nurgul' },
      { id: 'qairtten-couple', type: 'spouse', personAId: 'qairtten', personBId: 'qairtten-spouse' },
    ];
    const layout = calculateLayout(people, relationships);
    expect(rowOrder(layout, ['magdan', 'middle-sibling', 'qairtten']))
      .toEqual(['magdan', 'middle-sibling', 'qairtten']);
    expect(rowOrder(layout, ['magdan', 'nurgul', 'middle-sibling', 'qairtten', 'qairtten-spouse']))
      .toEqual(['magdan', 'nurgul', 'middle-sibling', 'qairtten', 'qairtten-spouse']);
    expect(centerX(layout, 'nurgul') - centerX(layout, 'magdan'))
      .toBe(TREE_CARD_WIDTH + 24);
    expect(centerX(layout, 'middle-sibling') - centerX(layout, 'nurgul'))
      .toBe(TREE_CARD_WIDTH + 40);
    expect(centerX(layout, 'qairtten') - centerX(layout, 'middle-sibling'))
      .toBe(TREE_CARD_WIDTH + 40);
    expect(centerX(layout, 'qairtten-spouse') - centerX(layout, 'qairtten'))
      .toBe(TREE_CARD_WIDTH + 24);
    expect(layout.generations.get('magdan')).toBe(layout.generations.get('nurgul'));
    expect(layout.generations.get('qairtten')).toBe(layout.generations.get('qairtten-spouse'));
    expect(familyCenterX(layout, ['grandfather', 'grandmother']))
      .toBeCloseTo(familyCenterX(layout, ['magdan', 'middle-sibling', 'qairtten']), 8);
    expectNoRowOverlaps(layout);
  });

  it('preserves native sibling groups with marriages at multiple generations', () => {
    const ids = [
      'top-father', 'top-mother',
      'sibling-1', 'sibling-2', 'sibling-3', 'sibling-4', 'sibling-5',
      'partner-1', 'partner-3', 'partner-5',
      'child-1', 'child-2', 'child-3', 'child-partner-1', 'child-partner-3',
    ];
    const people = ids.map((id, index) => createEmptyPerson({
      id,
      firstName: id,
      createdAt: `2020-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    }));
    const relationships = [
      { id: 'top-couple', type: 'spouse', personAId: 'top-father', personBId: 'top-mother' },
      ...['sibling-1', 'sibling-2', 'sibling-3', 'sibling-4', 'sibling-5'].flatMap((childId) => [
        { id: `top-father-${childId}`, type: 'parent-child', parentId: 'top-father', childId },
        { id: `top-mother-${childId}`, type: 'parent-child', parentId: 'top-mother', childId },
      ]),
      { id: 'couple-1', type: 'spouse', personAId: 'sibling-1', personBId: 'partner-1' },
      { id: 'couple-3', type: 'spouse', personAId: 'sibling-3', personBId: 'partner-3' },
      { id: 'couple-5', type: 'spouse', personAId: 'sibling-5', personBId: 'partner-5' },
      ...['child-1', 'child-2', 'child-3'].flatMap((childId) => [
        { id: `sibling-3-${childId}`, type: 'parent-child', parentId: 'sibling-3', childId },
        { id: `partner-3-${childId}`, type: 'parent-child', parentId: 'partner-3', childId },
      ]),
      { id: 'child-couple-1', type: 'spouse', personAId: 'child-1', personBId: 'child-partner-1' },
      { id: 'child-couple-3', type: 'spouse', personAId: 'child-3', personBId: 'child-partner-3' },
    ];
    const layout = calculateLayout(people, relationships);
    const topSiblings = ['sibling-1', 'sibling-2', 'sibling-3', 'sibling-4', 'sibling-5'];
    const lowerSiblings = ['child-1', 'child-2', 'child-3'];
    expect(rowOrder(layout, topSiblings)).toEqual(topSiblings);
    expect(rowOrder(layout, lowerSiblings)).toEqual(lowerSiblings);
    expect(rowOrder(layout, [...topSiblings, 'partner-1', 'partner-3', 'partner-5']))
      .toEqual(['sibling-1', 'partner-1', 'sibling-2', 'sibling-3', 'partner-3', 'sibling-4', 'sibling-5', 'partner-5']);
    expect(rowOrder(layout, [...lowerSiblings, 'child-partner-1', 'child-partner-3']))
      .toEqual(['child-1', 'child-partner-1', 'child-2', 'child-3', 'child-partner-3']);
    [['sibling-1', 'partner-1'], ['sibling-3', 'partner-3'], ['sibling-5', 'partner-5'],
      ['child-1', 'child-partner-1'], ['child-3', 'child-partner-3']].forEach(([a, b]) => {
      expect(centerX(layout, b) - centerX(layout, a)).toBe(TREE_CARD_WIDTH + 24);
    });
    expectNoRowOverlaps(layout);
  });

  it('keeps a non-backbone family together when one child marries across groups', () => {
    const ids = [
      'paternal-father', 'paternal-mother',
      'magdan', 'paternal-2', 'paternal-3', 'paternal-4',
      'sara', 'ersaiyn', 'nurgul', 'latipa', 'erkinbek', 'sabit',
    ];
    const people = ids.map((id, index) => createEmptyPerson({
      id,
      firstName: id,
      createdAt: `2020-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    }));
    const relationships = [
      { id: 'paternal-couple', type: 'spouse', personAId: 'paternal-father', personBId: 'paternal-mother' },
      ...['magdan', 'paternal-2', 'paternal-3', 'paternal-4'].flatMap((childId) => [
        { id: `paternal-father-${childId}`, type: 'parent-child', parentId: 'paternal-father', childId },
        { id: `paternal-mother-${childId}`, type: 'parent-child', parentId: 'paternal-mother', childId },
      ]),
      { id: 'magdan-nurgul', type: 'spouse', personAId: 'magdan', personBId: 'nurgul' },
      { id: 'sara-ersaiyn', type: 'spouse', personAId: 'sara', personBId: 'ersaiyn' },
      ...['nurgul', 'latipa', 'erkinbek'].flatMap((childId) => [
        { id: `sara-${childId}`, type: 'parent-child', parentId: 'sara', childId },
        { id: `ersaiyn-${childId}`, type: 'parent-child', parentId: 'ersaiyn', childId },
      ]),
      { id: 'latipa-sabit', type: 'spouse', personAId: 'latipa', personBId: 'sabit' },
    ];
    const layout = calculateLayout(people, relationships);
    const maternalChildrenCenter = familyCenterX(layout, ['nurgul', 'latipa', 'erkinbek']);
    const maternalParentsCenter = familyCenterX(layout, ['sara', 'ersaiyn']);

    expect(rowOrder(layout, ['nurgul', 'latipa', 'erkinbek']))
      .toEqual(['nurgul', 'latipa', 'erkinbek']);
    expect(centerX(layout, 'latipa') - centerX(layout, 'nurgul'))
      .toBe(TREE_CARD_WIDTH + 40);
    expect(centerX(layout, 'sabit') - centerX(layout, 'latipa'))
      .toBe(TREE_CARD_WIDTH + 24);
    expect(centerX(layout, 'erkinbek') - centerX(layout, 'sabit'))
      .toBeCloseTo(TREE_CARD_WIDTH + 40, 8);
    expect(maternalParentsCenter).toBeCloseTo(maternalChildrenCenter, 8);
    expectNoRowOverlaps(layout);
  });
});
