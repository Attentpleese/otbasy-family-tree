import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { calculateLayout, cardCenter, SIBLING_GAP, TREE_CARD_WIDTH } from './familyTreeLayout';

const peopleFor = (ids) => ids.map((id, index) => createEmptyPerson({
  id,
  firstName: id,
  createdAt: `2020-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
}));

const distance = (layout, a, b) => Math.abs(
  cardCenter(layout.positions.get(a)).x - cardCenter(layout.positions.get(b)).x,
);

const parentLinks = (parents, children) => children.flatMap((childId) => parents.map((parentId) => ({
  id: `${parentId}-${childId}`,
  type: 'parent-child',
  parentId,
  childId,
})));

const expectNativeGroup = (layout, ids) => {
  const ordered = [...ids].sort(
    (a, b) => cardCenter(layout.positions.get(a)).x - cardCenter(layout.positions.get(b)).x,
  );
  expect(ordered).toEqual(ids);
  ordered.slice(1).forEach((id, index) => {
    expect(distance(layout, ordered[index], id)).toBe(TREE_CARD_WIDTH + SIBLING_GAP);
  });
};

describe('native sibling groups across marriages', () => {
  it('keeps four sibling groups intact across several marriages', () => {
    const host = ['host-1', 'host-2', 'host-3', 'host-4', 'host-5'];
    const branches = ['a', 'b', 'c'].map((prefix) =>
      Array.from({ length: 4 }, (_, index) => `${prefix}-${index + 1}`));
    const leafPartners = branches.flatMap((children) => [`${children[1]}-partner`, `${children[3]}-partner`]);
    const ids = [
      'host-father', 'host-mother', ...host,
      ...['a', 'b', 'c'].flatMap((prefix) => [`${prefix}-father`, `${prefix}-mother`]),
      ...branches.flat(), ...leafPartners,
    ];
    const relationships = [
      { id: 'host-parents', type: 'spouse', personAId: 'host-father', personBId: 'host-mother' },
      ...parentLinks(['host-father', 'host-mother'], host),
      ...['a', 'b', 'c'].flatMap((prefix, branchIndex) => [
        { id: `${prefix}-parents`, type: 'spouse', personAId: `${prefix}-father`, personBId: `${prefix}-mother` },
        ...parentLinks([`${prefix}-father`, `${prefix}-mother`], branches[branchIndex]),
        { id: `host-${prefix}`, type: 'spouse', personAId: host[branchIndex], personBId: branches[branchIndex][0] },
        { id: `${prefix}-leaf-2`, type: 'spouse', personAId: branches[branchIndex][1], personBId: `${branches[branchIndex][1]}-partner` },
        { id: `${prefix}-leaf-4`, type: 'spouse', personAId: branches[branchIndex][3], personBId: `${branches[branchIndex][3]}-partner` },
      ]),
    ];
    const layout = calculateLayout(peopleFor(ids), relationships);
    expectNativeGroup(layout, host);
    branches.forEach((children) => expectNativeGroup(layout, children));
    ['a', 'b', 'c'].forEach((prefix, branchIndex) => {
      expect(layout.generations.get(host[branchIndex]))
        .toBe(layout.generations.get(branches[branchIndex][0]));
    });
  });

  it('does not move a spouse between two non-backbone sibling groups', () => {
    const host = ['host-1', 'host-2', 'host-3', 'host-4', 'host-5'];
    const groupB = ['b-1', 'b-2', 'b-3', 'b-4'];
    const groupC = ['c-1', 'c-2', 'c-3', 'c-4'];
    const ids = [
      'host-father', 'host-mother', ...host,
      'b-father', 'b-mother', ...groupB,
      'c-father', 'c-mother', ...groupC,
    ];
    const relationships = [
      { id: 'host-parents', type: 'spouse', personAId: 'host-father', personBId: 'host-mother' },
      ...parentLinks(['host-father', 'host-mother'], host),
      { id: 'b-parents', type: 'spouse', personAId: 'b-father', personBId: 'b-mother' },
      ...parentLinks(['b-father', 'b-mother'], groupB),
      { id: 'c-parents', type: 'spouse', personAId: 'c-father', personBId: 'c-mother' },
      ...parentLinks(['c-father', 'c-mother'], groupC),
      { id: 'host-b', type: 'spouse', personAId: 'host-1', personBId: 'b-1' },
      { id: 'host-c', type: 'spouse', personAId: 'host-5', personBId: 'c-1' },
      { id: 'b-c', type: 'spouse', personAId: 'b-2', personBId: 'c-3' },
    ];
    const layout = calculateLayout(peopleFor(ids), relationships);
    expectNativeGroup(layout, groupB);
    expectNativeGroup(layout, groupC);
    expect(distance(layout, 'b-2', 'c-3')).toBeGreaterThan(TREE_CARD_WIDTH + SIBLING_GAP);
    const center = (id) => cardCenter(layout.positions.get(id)).x;
    expect((center('c-father') + center('c-mother')) / 2)
      .toBeCloseTo(groupC.reduce((sum, id) => sum + center(id), 0) / groupC.length, 8);
  });

});
