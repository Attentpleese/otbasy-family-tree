import { describe, expect, it } from 'vitest';
import { buildFamilyUnits, moveSibling } from './familyUnits';
import { calculateLayout } from './familyTreeLayout';
import {
  crossedGrandparentsScenario,
  datedChildrenScenario,
  largeFamilyScenario,
  siblingScenario,
  stableBranchesScenario,
} from './familyScenarios';
import { visibleFamilyGraph } from './visibleFamilyGraph';
import { createEmptyPerson } from '../domain/familyGraph';

const precisionFamily = (children) => ({
  people: [
    createEmptyPerson({ id: 'parent-a', firstName: 'A' }),
    createEmptyPerson({ id: 'parent-b', firstName: 'B' }),
    ...children,
  ],
  relationships: children.flatMap((child, index) => [
    { id: `a-${index}`, type: 'parent-child', parentId: 'parent-a', childId: child.id },
    { id: `b-${index}`, type: 'parent-child', parentId: 'parent-b', childId: child.id },
  ]),
});

describe('family grouping features', () => {
  it('keeps a newly added sibling inside the shared FamilyUnit row group', () => {
    const graph = siblingScenario();
    const layout = calculateLayout(graph.people, graph.relationships);
    const row = ['magdan', 'nurgul', 'new-sibling', 'latipa']
      .map((id) => ({ id, x: layout.positions.get(id).x }))
      .sort((a, b) => a.x - b.x).map(({ id }) => id);

    expect(row.indexOf('new-sibling')).toBeLessThan(row.indexOf('latipa'));
    expect(Math.abs(row.indexOf('new-sibling') - row.indexOf('magdan'))).toBeLessThanOrEqual(2);
    expect(new Set(row.map((id) => layout.positions.get(id).y))).toHaveLength(1);
  });

  it('keeps creation order when all sibling birth dates are known', () => {
    const graph = datedChildrenScenario();
    const family = buildFamilyUnits(graph.people, graph.relationships).familyUnits
      .find((unit) => unit.children.includes('old'));
    expect(family.orderMode).toBe('manual');
    expect(family.children).toEqual(['young', 'old', 'middle-2', 'middle-1']);
  });

  it('uses persisted family order regardless of date precision', () => {
    const familyId = 'family:parent-a|parent-b';
    const graph = precisionFamily([
      createEmptyPerson({
        id: 'younger-year',
        firstName: 'Y',
        birthDate: '1970-01-01',
        birthDatePrecision: 'year',
        familyOrder: { [familyId]: 1 },
      }),
      createEmptyPerson({
        id: 'older-day',
        firstName: 'O',
        birthDate: '1968-12-20',
        birthDatePrecision: 'day',
        familyOrder: { [familyId]: 0 },
      }),
    ]);
    const family = buildFamilyUnits(graph.people, graph.relationships).familyUnits
      .find((unit) => unit.children.includes('older-day'));

    expect(family.orderMode).toBe('manual');
    expect(family.children).toEqual(['older-day', 'younger-year']);
  });

  it('allows manual movement when all sibling birth dates are known', () => {
    const graph = datedChildrenScenario();
    const moved = moveSibling(graph.people, graph.relationships, 'old', -1);
    const family = buildFamilyUnits(moved.people, graph.relationships).familyUnits
      .find((unit) => unit.children.includes('old'));

    expect(family.orderMode).toBe('manual');
    expect(family.children).toEqual(['old', 'young', 'middle-2', 'middle-1']);
    expect(moved.changedPeople).toHaveLength(4);
  });

  it('persists manual order per family when one date is missing', () => {
    const graph = siblingScenario();
    const moved = moveSibling(graph.people, graph.relationships, 'new-sibling', -1);
    const family = buildFamilyUnits(moved.people, graph.relationships).familyUnits
      .find((unit) => unit.children.includes('new-sibling'));
    expect(family.orderMode).toBe('manual');
    expect(family.children).toEqual(['new-sibling', 'magdan']);
    expect(moved.changedPeople.every((person) => Number.isFinite(person.familyOrder[family.id]))).toBe(true);
  });

  it('removes collapsed descendants from the graph and layout footprint', () => {
    const graph = largeFamilyScenario();
    const fullLayout = calculateLayout(graph.people, graph.relationships);
    const family = buildFamilyUnits(graph.people, graph.relationships).familyUnits
      .find((unit) => unit.partners.includes('child-3') && unit.children.length);
    const visible = visibleFamilyGraph(graph.people, graph.relationships, new Set([family.id]));
    const collapsedLayout = calculateLayout(visible.people, visible.relationships);

    expect(visible.people.some((person) => person.id === 'grand-1')).toBe(false);
    expect(visible.people.some((person) => person.id === 'child-3')).toBe(true);
    expect(collapsedLayout.height).toBeLessThan(fullLayout.height);
  });

  it('does not reorder untouched upper branches when a sibling is added below them', () => {
    const beforeGraph = stableBranchesScenario(false);
    const afterGraph = stableBranchesScenario(true);
    const before = calculateLayout(beforeGraph.people, beforeGraph.relationships);
    const after = calculateLayout(afterGraph.people, afterGraph.relationships);
    const upperIds = new Set([
      'z-grandfather-a', 'a-grandmother-a', 'y-grandfather-b', 'b-grandmother-b',
      'x-unrelated-a', 'c-unrelated-b', 'father-main', 'mother-main', 'unrelated-child',
    ]);
    const rowOrder = (layout) => [...upperIds]
      .map((id) => ({ id, ...layout.positions.get(id) }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(({ id }) => id);

    expect(rowOrder(after)).toEqual(rowOrder(before));
  });

  it('orders a spouse pair under their own parent families without crossed lines', () => {
    const graph = crossedGrandparentsScenario();
    const layout = calculateLayout(graph.people, graph.relationships);
    const units = buildFamilyUnits(graph.people, graph.relationships);
    const qabdygaliFamily = units.familyUnits.find((family) =>
      family.id === units.parentFamilyByPerson.get('qabdygali'));
    const qauaFamily = units.familyUnits.find((family) =>
      family.id === units.parentFamilyByPerson.get('qaua'));
    const center = (ids) => ids.reduce((sum, id) => {
      const position = layout.positions.get(id);
      return sum + position.x + position.width / 2;
    }, 0) / ids.length;

    expect(qabdygaliFamily.partners).toEqual(['zhuman', 'maria']);
    expect(qauaFamily.partners).toEqual(['magipar', 'sabikan']);
    expect(center(qabdygaliFamily.partners)).toBeLessThan(center(qauaFamily.partners));
    expect(center(['qabdygali'])).toBeLessThan(center(['qaua']));
  });
});
