import { describe, expect, it } from 'vitest';
import {
  addSibling,
  createEmptyPerson,
  removePersonFromGraph,
} from '../domain/familyGraph';
import { cardCenter, FAMILY_GAP, SIBLING_GAP, TREE_CARD_WIDTH } from './familyTreeLayout';
import { getFamilyLayoutMoveState, moveFamilyLayoutGroup } from './familyLayoutOrder';

const person = (id, index) => createEmptyPerson({
  id,
  firstName: id,
  createdAt: `2020-01-01T00:00:0${index}.000Z`,
});

const graph = () => ({
  people: ['a-1', 'a-2', 'b-1', 'b-2'].map(person),
  relationships: [
    { id: 'a-siblings', type: 'sibling', personAId: 'a-1', personBId: 'a-2' },
    { id: 'b-siblings', type: 'sibling', personAId: 'b-1', personBId: 'b-2' },
    { id: 'cross-couple', type: 'spouse', personAId: 'a-1', personBId: 'b-1' },
  ],
});

const rowGroupIndex = (layout, personId) => {
  const row = layout.familyLayoutRows.find((item) =>
    item.groups.some((group) => group.personIds.includes(personId)));
  return row?.groups.findIndex((group) => group.personIds.includes(personId)) ?? -1;
};

describe('persistent family layout order', () => {
  it('swaps a whole row group with its neighbor and normalizes the complete row', () => {
    const { people, relationships } = graph();
    const result = moveFamilyLayoutGroup(people, relationships, 'b-1', -1);
    const byId = new Map(result.people.map((item) => [item.id, item]));

    expect(result.changedPeople).toHaveLength(4);
    expect(byId.get('b-1').familyLayoutOrder).toBe(0);
    expect(byId.get('b-2').familyLayoutOrder).toBe(0);
    expect(byId.get('a-1').familyLayoutOrder).toBe(1);
    expect(byId.get('a-2').familyLayoutOrder).toBe(1);
  });

  it('reports row edges and refuses to cross an island boundary', () => {
    const { people, relationships } = graph();
    expect(getFamilyLayoutMoveState(people, relationships, 'a-1')).toEqual({
      canMoveLeft: false,
      canMoveRight: true,
    });
    expect(moveFamilyLayoutGroup(people, relationships, 'a-1', -1)).toBeNull();

    const unrelated = [...people, person('island', 4)];
    expect(getFamilyLayoutMoveState(unrelated, relationships, 'island')).toEqual({
      canMoveLeft: false,
      canMoveRight: false,
    });
  });

  it('persists a semantic order that the next layout calculation respects', async () => {
    const { people, relationships } = graph();
    const result = moveFamilyLayoutGroup(people, relationships, 'b-1', -1);
    const { buildFamilyTreeLayout } = await import('./familyTreeLayout');
    const layout = buildFamilyTreeLayout(result.people, relationships);
    const center = (id) => cardCenter(layout.positions.get(id)).x;

    expect(Math.max(center('b-1'), center('b-2')))
      .toBeLessThan(Math.min(center('a-1'), center('a-2')));
  });

  it('keeps a pure external spouse derived from the native sibling slot', async () => {
    const people = ['sibling-1', 'target', 'sibling-3', 'external'].map(person);
    const relationships = [
      { id: 'siblings-1', type: 'sibling', personAId: 'sibling-1', personBId: 'target' },
      { id: 'siblings-2', type: 'sibling', personAId: 'target', personBId: 'sibling-3' },
      { id: 'couple', type: 'spouse', personAId: 'target', personBId: 'external' },
    ];
    const { buildFamilyTreeLayout } = await import('./familyTreeLayout');
    const layout = buildFamilyTreeLayout(people, relationships);
    const center = (id) => cardCenter(layout.positions.get(id)).x;

    expect(moveFamilyLayoutGroup(people, relationships, 'external', -1)).toBeNull();
    expect(center('external') - center('target')).toBe(TREE_CARD_WIDTH + 24);
    expect(center('target') - center('sibling-1')).toBe(TREE_CARD_WIDTH + SIBLING_GAP);
    expect(layout.derivedPartnerIds).toContain('external');
  });

  it('keeps manual order through a multi-marriage row', async () => {
    const people = [
      ...['a-1', 'a-2'].map((id, index) => ({ ...person(id, index), familyLayoutOrder: 1 })),
      ...['b-1', 'b-2'].map((id, index) => ({ ...person(id, index + 2), familyLayoutOrder: 0 })),
      ...['c-1', 'c-2'].map((id, index) => ({ ...person(id, index + 4), familyLayoutOrder: 2 })),
    ];
    const relationships = [
      { id: 'a-siblings', type: 'sibling', personAId: 'a-1', personBId: 'a-2' },
      { id: 'b-siblings', type: 'sibling', personAId: 'b-1', personBId: 'b-2' },
      { id: 'c-siblings', type: 'sibling', personAId: 'c-1', personBId: 'c-2' },
      { id: 'a-b', type: 'spouse', personAId: 'a-1', personBId: 'b-1' },
      { id: 'a-c', type: 'partner', personAId: 'a-1', personBId: 'c-1' },
    ];
    const { buildFamilyTreeLayout } = await import('./familyTreeLayout');
    const layout = buildFamilyTreeLayout(people, relationships);

    expect(rowGroupIndex(layout, 'b-1')).toBeLessThan(rowGroupIndex(layout, 'a-1'));
    expect(rowGroupIndex(layout, 'a-1')).toBeLessThan(rowGroupIndex(layout, 'c-1'));
  });

  it('keeps independent manual orders on multiple deep rows', async () => {
    const ranked = (id, index, familyLayoutOrder) => ({
      ...person(id, index),
      familyLayoutOrder,
    });
    const people = [
      ranked('a-1', 0, 1), ranked('a-2', 1, 1),
      ranked('b-1', 2, 0), ranked('b-2', 3, 0),
      ranked('a-child-1', 4, 0), ranked('a-child-2', 5, 0),
      ranked('b-child-1', 6, 1), ranked('b-child-2', 7, 1),
      ranked('deep-a', 8, 1), ranked('deep-b', 9, 0),
    ];
    const relationships = [
      { id: 'a-siblings', type: 'sibling', personAId: 'a-1', personBId: 'a-2' },
      { id: 'b-siblings', type: 'sibling', personAId: 'b-1', personBId: 'b-2' },
      { id: 'bridge', type: 'spouse', personAId: 'a-1', personBId: 'b-1' },
      ...['a-child-1', 'a-child-2'].map((childId) => ({
        id: `a-2-${childId}`, type: 'parent-child', parentId: 'a-2', childId,
      })),
      ...['b-child-1', 'b-child-2'].map((childId) => ({
        id: `b-2-${childId}`, type: 'parent-child', parentId: 'b-2', childId,
      })),
      { id: 'child-bridge', type: 'spouse', personAId: 'a-child-1', personBId: 'b-child-1' },
      { id: 'a-deep', type: 'parent-child', parentId: 'a-child-2', childId: 'deep-a' },
      { id: 'b-deep', type: 'parent-child', parentId: 'b-child-2', childId: 'deep-b' },
    ];
    const { buildFamilyTreeLayout } = await import('./familyTreeLayout');
    const layout = buildFamilyTreeLayout(people, relationships);

    expect(rowGroupIndex(layout, 'b-1')).toBeLessThan(rowGroupIndex(layout, 'a-1'));
    expect(rowGroupIndex(layout, 'a-child-1')).toBeLessThan(rowGroupIndex(layout, 'b-child-1'));
    expect(rowGroupIndex(layout, 'deep-b')).toBeLessThan(rowGroupIndex(layout, 'deep-a'));
  });

  it('inherits manual group order when a sibling is added and retains it after deletion', async () => {
    const basePeople = [
      { ...person('parent', 0) },
      { ...person('ordered', 1), familyLayoutOrder: 0 },
      { ...person('removed-later', 2), familyLayoutOrder: 0 },
      { ...person('neighbor', 3), familyLayoutOrder: 1 },
      { ...person('neighbor-parent', 4) },
    ];
    const baseRelationships = [
      { id: 'parent-ordered', type: 'parent-child', parentId: 'parent', childId: 'ordered' },
      { id: 'parent-removed', type: 'parent-child', parentId: 'parent', childId: 'removed-later' },
      { id: 'neighbor-parent-link', type: 'parent-child', parentId: 'neighbor-parent', childId: 'neighbor' },
      { id: 'ordered-neighbor', type: 'spouse', personAId: 'ordered', personBId: 'neighbor' },
    ];
    const added = addSibling({
      people: basePeople,
      relationships: baseRelationships,
      personId: 'ordered',
      sibling: person('new-sibling', 5),
    });

    expect(added.ok).toBe(true);
    expect(added.personAdded.familyLayoutOrder).toBe(0);

    const afterDelete = removePersonFromGraph(added.people, added.relationships, 'removed-later');
    const { buildFamilyTreeLayout } = await import('./familyTreeLayout');
    const layout = buildFamilyTreeLayout(afterDelete.people, afterDelete.relationships);
    expect(rowGroupIndex(layout, 'new-sibling')).toBeLessThan(rowGroupIndex(layout, 'neighbor'));
  });

  it('preserves each component sequence when two manually ordered components merge', async () => {
    const makeGroup = (prefix, order, start) => [1, 2].map((number, index) => ({
      ...person(`${prefix}-${number}`, start + index),
      familyLayoutOrder: order,
    }));
    const people = [
      ...makeGroup('a', 0, 0), ...makeGroup('b', 1, 2),
      ...makeGroup('c', 0, 4), ...makeGroup('d', 1, 6),
    ];
    const relationships = [
      ...['a', 'b', 'c', 'd'].map((prefix) => ({
        id: `${prefix}-siblings`, type: 'sibling', personAId: `${prefix}-1`, personBId: `${prefix}-2`,
      })),
      { id: 'first-component', type: 'spouse', personAId: 'a-1', personBId: 'b-1' },
      { id: 'second-component', type: 'spouse', personAId: 'c-1', personBId: 'd-1' },
      { id: 'component-merge', type: 'partner', personAId: 'b-2', personBId: 'c-2' },
    ];
    const { buildFamilyTreeLayout } = await import('./familyTreeLayout');
    const merged = buildFamilyTreeLayout(people, relationships);

    expect(rowGroupIndex(merged, 'a-1')).toBeLessThan(rowGroupIndex(merged, 'b-1'));
    expect(rowGroupIndex(merged, 'c-1')).toBeLessThan(rowGroupIndex(merged, 'd-1'));

    const moved = moveFamilyLayoutGroup(people, relationships, 'd-1', -1);
    expect(moved.changedPeople).toHaveLength(8);
    expect(new Set(moved.changedPeople.map(({ familyLayoutOrder }) => familyLayoutOrder))).toEqual(
      new Set([0, 1, 2, 3]),
    );
  });
});
