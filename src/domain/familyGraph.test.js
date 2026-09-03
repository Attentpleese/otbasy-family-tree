import { describe, expect, it } from 'vitest';
import {
  addChildToExistingCouple,
  addChildWithNewPartner,
  addPersonWithRelationship,
  addParentPair,
  addSibling,
  canonicalizeDateForPrecision,
  createEmptyPerson,
  getLifeYears,
  getPersonName,
  getSiblings,
  removePersonFromGraph,
  samplePeople,
  sampleRelationships,
  toFamilyChartData,
  upsertRelationship,
  validateGraph,
  validateRelationship,
} from './familyGraph';

describe('family graph rules', () => {
  it('keeps family layout order optional in the person model', () => {
    expect(createEmptyPerson().familyLayoutOrder).toBeNull();
    expect(createEmptyPerson({ familyLayoutOrder: 3 }).familyLayoutOrder).toBe(3);
  });

  it('canonicalizes and displays a year-precision life date without exposing the service day', () => {
    const birthDate = canonicalizeDateForPrecision('1967', 'year');
    const person = createEmptyPerson({
      birthDate,
      birthDatePrecision: 'year',
      deathDate: canonicalizeDateForPrecision('2020', 'year'),
      deathDatePrecision: 'year',
    });

    expect(birthDate).toBe('1967-01-01');
    expect(canonicalizeDateForPrecision('1967-04', 'month')).toBe('1967-04-01');
    expect(getLifeYears(person)).toBe('1967 – 2020');
    expect(getLifeYears(createEmptyPerson({ deathDate: '2020-01-01', deathDatePrecision: 'year' })))
      .toBe('? – 2020');
  });

  it('includes the patronymic in the displayed person name', () => {
    const person = createEmptyPerson({
      firstName: 'Даулет',
      patronymic: 'Аскарович',
      lastName: 'Қабдығали',
    });

    expect(getPersonName(person)).toBe('Даулет Аскарович Қабдығали');
  });

  it('keeps clan data in the person model and chart export', () => {
    const person = createEmptyPerson({ id: 'clan-person', firstName: 'Аян', clan: 'Найман' });
    const [chartPerson] = toFamilyChartData([person], []);

    expect(person.clan).toBe('Найман');
    expect(chartPerson.data.clan).toBe('Найман');
  });

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

  it('adds a child to both members of an existing active couple', () => {
    const child = createEmptyPerson({ id: 'couple-child', firstName: 'Ребёнок' });
    const result = addChildToExistingCouple({
      people: samplePeople,
      relationships: sampleRelationships,
      selectedId: 'p1',
      partnerId: 'p2',
      person: child,
    });

    expect(result.ok).toBe(true);
    expect(result.peopleAdded).toEqual([expect.objectContaining({ id: 'couple-child' })]);
    expect(result.relationshipsAdded).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'parent-child', parentId: 'p1', childId: 'couple-child' }),
      expect.objectContaining({ type: 'parent-child', parentId: 'p2', childId: 'couple-child' }),
    ]));
  });

  it('does not offer a divorced relationship as an active couple for child creation', () => {
    const child = createEmptyPerson({ id: 'former-couple-child', firstName: 'Ребёнок' });
    const result = addChildToExistingCouple({
      people: samplePeople,
      relationships: [
        ...sampleRelationships.filter((relationship) => relationship.id !== 'r1'),
        { id: 'former-couple', type: 'divorced', personAId: 'p1', personBId: 'p2' },
      ],
      selectedId: 'p1',
      partnerId: 'p2',
      person: child,
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('activePartnerRequired');
  });

  it('adds a new partner and their child in one graph operation', () => {
    const selected = createEmptyPerson({ id: 'selected', firstName: 'Родитель' });
    const partner = createEmptyPerson({ id: 'new-partner', firstName: 'Партнёр' });
    const child = createEmptyPerson({ id: 'new-family-child', firstName: 'Ребёнок' });
    const result = addChildWithNewPartner({
      people: [selected],
      relationships: [],
      selectedId: selected.id,
      newPartner: partner,
      child,
    });

    expect(result.ok).toBe(true);
    expect(result.peopleAdded.map((person) => person.id)).toEqual(['new-partner', 'new-family-child']);
    expect(result.relationshipsAdded).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'spouse', personAId: 'selected', personBId: 'new-partner' }),
      expect.objectContaining({ type: 'parent-child', parentId: 'selected', childId: 'new-family-child' }),
      expect.objectContaining({ type: 'parent-child', parentId: 'new-partner', childId: 'new-family-child' }),
    ]));
  });

  it('rejects creating a relative without a first name', () => {
    const result = addPersonWithRelationship({
      people: samplePeople,
      relationships: sampleRelationships,
      selectedId: 'p3',
      relationType: 'child',
      person: createEmptyPerson({ firstName: '   ' }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('missingFirstName');
  });

  it('deletes a person with children while preserving the children', () => {
    const result = removePersonFromGraph(samplePeople, sampleRelationships, 'p1');

    expect(result.ok).toBe(true);
    expect(result.people.some((person) => person.id === 'p1')).toBe(false);
    expect(result.people.some((person) => person.id === 'p3')).toBe(true);
    expect(
      result.relationships.some((relationship) =>
        [relationship.parentId, relationship.childId, relationship.personAId, relationship.personBId].includes('p1'),
      ),
    ).toBe(false);
  });

  it('deletes a leaf person and all of their remaining relationships', () => {
    const result = removePersonFromGraph(samplePeople, sampleRelationships, 'p5');

    expect(result.ok).toBe(true);
    expect(result.people.some((person) => person.id === 'p5')).toBe(false);
    expect(
      result.relationships.some((relationship) =>
        [relationship.parentId, relationship.childId, relationship.personAId, relationship.personBId].includes('p5'),
      ),
    ).toBe(false);
  });

  it('removes a spouse relationship without deleting the surviving spouse', () => {
    const people = samplePeople.slice(0, 2);
    const relationships = sampleRelationships.slice(0, 1);
    const result = removePersonFromGraph(people, relationships, 'p1');

    expect(result.ok).toBe(true);
    expect(result.people.map((person) => person.id)).toEqual(['p2']);
    expect(result.relationships).toEqual([]);
  });

  it('adds two married parents to a child in one graph operation', () => {
    const child = createEmptyPerson({ id: 'child', firstName: 'Ребёнок' });
    const mother = createEmptyPerson({ id: 'mother', firstName: 'Мама' });
    const father = createEmptyPerson({ id: 'father', firstName: 'Папа' });
    const result = addParentPair({ people: [child], relationships: [], childId: child.id, mother, father });

    expect(result.ok).toBe(true);
    expect(result.peopleAdded.map((person) => person.gender)).toEqual(['female', 'male']);
    expect(result.relationshipsAdded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'parent-child', parentId: 'mother', childId: 'child' }),
        expect.objectContaining({ type: 'parent-child', parentId: 'father', childId: 'child' }),
        expect.objectContaining({ type: 'spouse', personAId: 'mother', personBId: 'father' }),
      ]),
    );
  });

  it('does not add a parent pair when the child already has a parent', () => {
    const people = [
      createEmptyPerson({ id: 'child', firstName: 'Ребёнок' }),
      createEmptyPerson({ id: 'existing', firstName: 'Родитель' }),
    ];
    const relationships = [{ id: 'existing-link', type: 'parent-child', parentId: 'existing', childId: 'child' }];
    const result = addParentPair({
      people,
      relationships,
      childId: 'child',
      mother: createEmptyPerson({ firstName: 'Мама' }),
      father: createEmptyPerson({ firstName: 'Папа' }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('parentPairRequiresNoParents');
  });

  it('adds a sibling as a child of every known parent', () => {
    const sibling = createEmptyPerson({ id: 'new-sibling', firstName: 'Сестра' });
    const result = addSibling({
      people: samplePeople,
      relationships: sampleRelationships,
      personId: 'p3',
      sibling,
    });

    expect(result.ok).toBe(true);
    expect(result.relationshipsAdded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'parent-child', parentId: 'p1', childId: 'new-sibling' }),
        expect.objectContaining({ type: 'parent-child', parentId: 'p2', childId: 'new-sibling' }),
      ]),
    );
  });

  it('adds a sibling through a known parent or a direct sibling relationship', () => {
    const child = createEmptyPerson({ id: 'child', firstName: 'Ребёнок' });
    const parent = createEmptyPerson({ id: 'parent', firstName: 'Родитель' });
    const sibling = createEmptyPerson({ id: 'new-sibling', firstName: 'Брат' });
    const oneParentResult = addSibling({
      people: [parent, child],
      relationships: [{ id: 'parent-link', type: 'parent-child', parentId: 'parent', childId: 'child' }],
      personId: 'child',
      sibling,
    });

    expect(oneParentResult.ok).toBe(true);
    expect(oneParentResult.relationshipsAdded).toHaveLength(1);
    expect(oneParentResult.relationshipsAdded[0]).toMatchObject({ parentId: 'parent', childId: 'new-sibling' });

    const noParentResult = addSibling({ people: [child], relationships: [], personId: 'child', sibling });
    expect(noParentResult.ok).toBe(true);
    expect(noParentResult.relationshipsAdded).toEqual([
      expect.objectContaining({
        type: 'sibling',
        personAId: 'child',
        personBId: 'new-sibling',
      }),
    ]);
    expect(getSiblings(noParentResult.relationships, 'child')).toEqual(['new-sibling']);
    expect(getSiblings(noParentResult.relationships, 'new-sibling')).toEqual(['child']);
  });
});
