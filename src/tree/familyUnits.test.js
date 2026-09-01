import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { buildFamilyUnits } from './familyUnits';

const people = (...ids) => ids.map((id) => createEmptyPerson({ id, firstName: id }));

describe('family units', () => {
  it('groups shared children into one partner family in person order', () => {
    const result = buildFamilyUnits(people('mother', 'father', 'older', 'younger'), [
      { id: 'couple', type: 'spouse', personAId: 'mother', personBId: 'father' },
      { id: 'm1', type: 'parent-child', parentId: 'mother', childId: 'older' },
      { id: 'f1', type: 'parent-child', parentId: 'father', childId: 'older' },
      { id: 'm2', type: 'parent-child', parentId: 'mother', childId: 'younger' },
      { id: 'f2', type: 'parent-child', parentId: 'father', childId: 'younger' },
    ]);

    expect(result.familyUnits).toEqual([
      expect.objectContaining({
        partners: ['mother', 'father'],
        children: ['older', 'younger'],
        relationshipType: 'spouse',
      }),
    ]);
  });

  it('builds separate units for repeat partners and a single parent', () => {
    const result = buildFamilyUnits(people('a', 'b', 'c', 'first', 'second', 'single-child'), [
      { type: 'spouse', personAId: 'a', personBId: 'b' },
      { type: 'partner', personAId: 'a', personBId: 'c' },
      { type: 'parent-child', parentId: 'a', childId: 'first' },
      { type: 'parent-child', parentId: 'b', childId: 'first' },
      { type: 'parent-child', parentId: 'a', childId: 'second' },
      { type: 'parent-child', parentId: 'c', childId: 'second' },
      { type: 'parent-child', parentId: 'c', childId: 'single-child' },
    ]);

    expect(result.familyUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ partners: ['a', 'b'], children: ['first'] }),
      expect.objectContaining({ partners: ['a', 'c'], children: ['second'] }),
      expect.objectContaining({ partners: ['c'], children: ['single-child'] }),
    ]));
  });

  it('turns connected direct sibling edges into one virtual family', () => {
    const result = buildFamilyUnits(people('a', 'b', 'c'), [
      { type: 'sibling', personAId: 'a', personBId: 'b' },
      { type: 'sibling', personAId: 'b', personBId: 'c' },
    ]);

    expect(result.familyUnits).toEqual([
      expect.objectContaining({ partners: [], children: ['a', 'b', 'c'], kind: 'virtual-sibling' }),
    ]);
  });
});
