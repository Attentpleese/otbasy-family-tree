export const RELATIONSHIP_TYPES = ['parent-child', 'spouse', 'partner', 'divorced'];

export const createEmptyPerson = (overrides = {}) => ({
  id: crypto.randomUUID(),
  firstName: '',
  lastName: '',
  maidenName: '',
  gender: 'other',
  birthDate: '',
  deathDate: '',
  birthPlace: '',
  photoUrl: '',
  notes: '',
  ...overrides,
});

export const normalizePerson = (person) => ({
  maidenName: '',
  birthDate: '',
  deathDate: '',
  birthPlace: '',
  photoUrl: '',
  notes: '',
  ...person,
});

export const normalizeRelationship = (relationship) => ({
  id: relationship.id || crypto.randomUUID(),
  startDate: '',
  endDate: '',
  ...relationship,
});

export const getPersonName = (person) => {
  const fullName = [person.firstName, person.maidenName ? `(${person.maidenName})` : '', person.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName;
};

export const getLifeYears = (person) => {
  const birth = person.birthDate?.slice(0, 4) || '';
  const death = person.deathDate?.slice(0, 4) || '';
  if (!birth && !death) return '';
  return `${birth || '?'} - ${death || ''}`;
};

export const getParents = (relationships, childId) =>
  relationships
    .filter((relationship) => relationship.type === 'parent-child' && relationship.childId === childId)
    .map((relationship) => relationship.parentId);

export const getChildren = (relationships, parentId) =>
  relationships
    .filter((relationship) => relationship.type === 'parent-child' && relationship.parentId === parentId)
    .map((relationship) => relationship.childId);

export const getPartners = (relationships, personId) =>
  relationships
    .filter(
      (relationship) =>
        ['spouse', 'partner', 'divorced'].includes(relationship.type) &&
        (relationship.personAId === personId || relationship.personBId === personId),
    )
    .map((relationship) => (relationship.personAId === personId ? relationship.personBId : relationship.personAId));

export const getSiblings = (relationships, personId) => {
  const parents = getParents(relationships, personId);
  if (parents.length === 0) return [];

  const siblings = new Set();
  parents.forEach((parentId) => {
    getChildren(relationships, parentId).forEach((childId) => {
      if (childId !== personId) siblings.add(childId);
    });
  });

  return [...siblings];
};

const wouldCreateAncestorCycle = (relationships, parentId, childId) => {
  if (parentId === childId) return true;

  const visit = (currentId, seen = new Set()) => {
    if (currentId === parentId) return true;
    if (seen.has(currentId)) return false;
    seen.add(currentId);

    return getChildren(relationships, currentId).some((nextId) => visit(nextId, seen));
  };

  return visit(childId);
};

export const validateRelationship = (people, relationships, candidate) => {
  const errors = [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const relationship = normalizeRelationship(candidate);

  if (!RELATIONSHIP_TYPES.includes(relationship.type)) {
    errors.push({ code: 'invalidRelationshipType' });
    return errors;
  }

  if (relationship.type === 'parent-child') {
    const { parentId, childId } = relationship;
    if (!peopleById.has(parentId) || !peopleById.has(childId)) errors.push({ code: 'missingPerson' });
    if (parentId === childId) errors.push({ code: 'selfParent' });

    const otherParentEdges = relationships.filter(
      (item) =>
        item.id !== relationship.id &&
        item.type === 'parent-child' &&
        item.childId === childId &&
        item.parentId !== parentId,
    );
    if (otherParentEdges.length >= 2) errors.push({ code: 'tooManyParents' });

    const duplicate = relationships.some(
      (item) =>
        item.id !== relationship.id &&
        item.type === 'parent-child' &&
        item.parentId === parentId &&
        item.childId === childId,
    );
    if (duplicate) errors.push({ code: 'duplicateRelationship' });

    const isPartnerAlready = relationships.some(
      (item) =>
        item.id !== relationship.id &&
        ['spouse', 'partner', 'divorced'].includes(item.type) &&
        ((item.personAId === parentId && item.personBId === childId) ||
          (item.personAId === childId && item.personBId === parentId)),
    );
    if (isPartnerAlready) errors.push({ code: 'partnerCannotBeParent' });

    const graphWithCandidate = relationships
      .filter((item) => item.id !== relationship.id)
      .concat(relationship);
    if (wouldCreateAncestorCycle(graphWithCandidate, parentId, childId)) errors.push({ code: 'cycleDetected' });
  }

  if (['spouse', 'partner', 'divorced'].includes(relationship.type)) {
    const { personAId, personBId } = relationship;
    if (!peopleById.has(personAId) || !peopleById.has(personBId)) errors.push({ code: 'missingPerson' });
    if (personAId === personBId) errors.push({ code: 'selfPartner' });

    const duplicate = relationships.some(
      (item) =>
        item.id !== relationship.id &&
        ['spouse', 'partner', 'divorced'].includes(item.type) &&
        ((item.personAId === personAId && item.personBId === personBId) ||
          (item.personAId === personBId && item.personBId === personAId)),
    );
    if (duplicate) errors.push({ code: 'duplicateRelationship' });

    const directParentChild = relationships.some(
      (item) =>
        item.id !== relationship.id &&
        item.type === 'parent-child' &&
        ((item.parentId === personAId && item.childId === personBId) ||
          (item.parentId === personBId && item.childId === personAId)),
    );
    if (directParentChild) errors.push({ code: 'partnerCannotBeParent' });
  }

  return errors;
};

export const validateGraph = (people, relationships) => {
  const errors = [];

  relationships.forEach((relationship) => {
    validateRelationship(people, relationships.filter((item) => item.id !== relationship.id), relationship).forEach(
      (error) => errors.push({ relationshipId: relationship.id, ...error }),
    );
  });

  return errors;
};

export const addPersonWithRelationship = ({ people, relationships, selectedId, relationType, person }) => {
  const newPerson = normalizePerson(person);
  const nextPeople = [...people, newPerson];
  const relationship =
    relationType === 'parent'
      ? normalizeRelationship({ type: 'parent-child', parentId: newPerson.id, childId: selectedId })
      : relationType === 'child'
        ? normalizeRelationship({ type: 'parent-child', parentId: selectedId, childId: newPerson.id })
        : normalizeRelationship({ type: 'spouse', personAId: selectedId, personBId: newPerson.id });

  const errors = validateRelationship(nextPeople, relationships, relationship);
  if (errors.length) return { ok: false, errors };

  return { ok: true, people: nextPeople, relationships: [...relationships, relationship], relationship };
};

export const upsertRelationship = (people, relationships, relationship) => {
  const normalized = normalizeRelationship(relationship);
  const nextRelationships = relationships.filter((item) => item.id !== normalized.id);
  const errors = validateRelationship(people, nextRelationships, normalized);
  if (errors.length) return { ok: false, errors };
  return { ok: true, relationships: [...nextRelationships, normalized] };
};

export const toFamilyChartData = (people, relationships) => {
  const chartData = people.map((person) => {
    const parents = getParents(relationships, person.id);
    const children = getChildren(relationships, person.id);
    const spouses = getPartners(relationships, person.id);

    return {
      id: person.id,
      data: {
        gender: person.gender === 'male' ? 'M' : 'F',
        'first name': person.firstName || '',
        'last name': person.lastName || person.maidenName || '',
        birthday: getLifeYears(person),
        avatar: person.photoUrl || '',
        label: person.birthPlace || '',
      },
      rels: {
        ...(parents.length ? { parents } : {}),
        ...(children.length ? { children } : {}),
        ...(spouses.length ? { spouses } : {}),
      },
    };
  });

  return chartData;
};

export const samplePeople = [
  createEmptyPerson({
    id: 'p1',
    firstName: 'Алексей',
    lastName: 'Соколов',
    gender: 'male',
    birthDate: '1948-04-12',
    birthPlace: 'Алматы',
  }),
  createEmptyPerson({
    id: 'p2',
    firstName: 'Мәриям',
    lastName: 'Соколова',
    maidenName: 'Әлімова',
    gender: 'female',
    birthDate: '1952-09-03',
    birthPlace: 'Қарағанды',
  }),
  createEmptyPerson({
    id: 'p3',
    firstName: 'Ирина',
    lastName: 'Соколова',
    gender: 'female',
    birthDate: '1977-06-18',
  }),
  createEmptyPerson({
    id: 'p4',
    firstName: 'Тимур',
    lastName: 'Соколов',
    gender: 'male',
    birthDate: '1980-11-27',
  }),
  createEmptyPerson({
    id: 'p5',
    firstName: 'Әлия',
    lastName: 'Соколова',
    gender: 'female',
    birthDate: '2008-02-08',
  }),
];

export const sampleRelationships = [
  { id: 'r1', type: 'spouse', personAId: 'p1', personBId: 'p2', startDate: '1974-05-21' },
  { id: 'r2', type: 'parent-child', parentId: 'p1', childId: 'p3' },
  { id: 'r3', type: 'parent-child', parentId: 'p2', childId: 'p3' },
  { id: 'r4', type: 'parent-child', parentId: 'p1', childId: 'p4' },
  { id: 'r5', type: 'parent-child', parentId: 'p2', childId: 'p4' },
  { id: 'r6', type: 'parent-child', parentId: 'p4', childId: 'p5' },
];
