import { describe, expect, it } from 'vitest';
import {
  addPersonWithRelationship,
  createEmptyPerson,
  getSiblings,
  samplePeople,
  sampleRelationships,
  upsertRelationship,
  validateGraph,
  validateRelationship,
} from './familyGraph';

describe('family graph rules', () => {
  it('allows adding a person, marriage, children, remarriage and divorce states', () => {
    const people = [
      createEmptyPerson({ id: 'a', firstName: 'A' }),
      createEmptyPerson({ id: 'b', firstName: 'B' }),
      createEmptyPerson({ id: 'c', firstName: 'C' }),
      createEmptyPerson({ id: 'd', firstName: 'D' }),
    ];

    let relationships = [];
    let result = upsertRelationship(people, relationships, { id: 'ab', type: 'spouse', personAId: 'a', personBId: 'b' });
    expect(result.ok).toBe(true);
    relationships = result.relationships;

    result = upsertRelationship(people, relationships, { id: 'ac', type: 'divorced', personAId: 'a', personBId: 'c' });
    expect(result.ok).toBe(true);
    relationships = result.relationships;

    result = upsertRelationship(people, relationships, { id: 'ad', type: 'parent-child', parentId: 'a', childId: 'd' });
    expect(result.ok).toBe(true);
    relationships = result.relationships;

    result = upsertRelationship(people, relationships, { id: 'bd', type: 'parent-child', parentId: 'b', childId: 'd' });
    expect(result.ok).toBe(true);
    expect(validateGraph(people, relationships).length).toBe(0);
  });

  it('computes siblings from shared parents', () => {
    expect(getSiblings(sampleRelationships, 'p3')).toEqual(['p4']);
  });

  it('rejects a third biological parent', () => {
    const errors = validateRelationship(samplePeople, sampleRelationships, {
      type: 'parent-child',
      parentId: 'p3',
      childId: 'p4',
    });

    expect(errors.map((error) => error.code)).toContain('tooManyParents');
  });

  it('rejects spouse or partner as parent of the same person', () => {
    const errors = validateRelationship(samplePeople, sampleRelationships, {
      type: 'parent-child',
      parentId: 'p1',
      childId: 'p2',
    });

    expect(errors.map((error) => error.code)).toContain('partnerCannotBeParent');
  });

  it('rejects cycles in parent-child graph', () => {
    const errors = validateRelationship(samplePeople, sampleRelationships, {
      type: 'parent-child',
      parentId: 'p5',
      childId: 'p1',
    });

    expect(errors.map((error) => error.code)).toContain('cycleDetected');
  });

  it('creates typed relationships from selected cards', () => {
    const person = createEmptyPerson({ id: 'new-child', firstName: 'Новый' });
    const result = addPersonWithRelationship({
      people: samplePeople,
      relationships: sampleRelationships,
      selectedId: 'p3',
      relationType: 'child',
      person,
    });

    expect(result.ok).toBe(true);
    expect(result.relationship).toMatchObject({
      type: 'parent-child',
      parentId: 'p3',
      childId: 'new-child',
    });
  });
});
