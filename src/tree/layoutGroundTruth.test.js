import { describe, expect, it } from 'vitest';
import { calculateLayout, cardCenter } from './familyTreeLayout';
import { groundTruthScenario } from './familyScenarios';

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

    expect(familyCenterX(step4, ['ground-paternal-grandfather', 'ground-paternal-grandmother']))
      .toBeCloseTo(centerX(step4, 'ground-father'), 8);
    expect(familyCenterX(step4, ['ground-maternal-grandfather', 'ground-maternal-grandmother']))
      .toBeCloseTo(centerX(step4, 'ground-mother'), 8);

    expect(rowOrder(step5, [
      'ground-paternal-sibling', 'ground-father', 'ground-mother',
    ])).toEqual([
      'ground-paternal-sibling', 'ground-father', 'ground-mother',
    ]);
    expect(familyCenterX(step5, ['ground-paternal-grandfather', 'ground-paternal-grandmother']))
      .toBeCloseTo(familyCenterX(step5, ['ground-paternal-sibling', 'ground-father']), 8);

    expect(rowOrder(step6, [
      'ground-paternal-sibling', 'ground-father', 'ground-mother', 'ground-maternal-sibling',
    ])).toEqual([
      'ground-paternal-sibling', 'ground-father', 'ground-mother', 'ground-maternal-sibling',
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
});
