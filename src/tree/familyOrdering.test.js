import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { buildFamilyUnits } from './familyUnits';
import { datedChildrenScenario } from './familyScenarios';

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

describe('family child ordering', () => {
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
});
