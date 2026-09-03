import { comparePersonDisplayOrder, normalizeDatePrecision } from '../domain/familyGraph';

const PARTNER_TYPES = new Set(['spouse', 'partner', 'divorced']);

const sortedKey = (ids) => [...ids].sort().join('|');

const hasBirthDate = (person) => {
  const value = person?.birthDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
};

const precisionLength = {
  year: 4,
  month: 7,
  day: 10,
};

const familyBirthOrderMode = (children, peopleById) => {
  if (!children.length || !children.every((id) => hasBirthDate(peopleById.get(id)))) return 'manual';
  const precisions = children.map((id) => normalizeDatePrecision(peopleById.get(id).birthDatePrecision));
  if (precisions.includes('year')) return 'birth-year';
  if (precisions.includes('month')) return 'birth-month';
  return 'birth-date';
};

const makeUnionFind = (ids) => {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  return { find, union };
};

export function buildFamilyUnits(people, relationships) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const fallbackOrder = new Map(people.map((person, index) => [person.id, index]));
  const displayOrder = new Map([...people]
    .sort((a, b) => comparePersonDisplayOrder(a, b, fallbackOrder))
    .map((person, index) => [person.id, index]));
  const validPerson = (id) => peopleById.has(id);
  const parentIdsByChild = new Map();

  relationships.forEach((relationship) => {
    if (
      relationship.type !== 'parent-child' ||
      !validPerson(relationship.parentId) ||
      !validPerson(relationship.childId)
    ) return;
    const parents = parentIdsByChild.get(relationship.childId) || [];
    if (!parents.includes(relationship.parentId)) parents.push(relationship.parentId);
    parentIdsByChild.set(relationship.childId, parents);
  });

  const partnerRelationshipByKey = new Map();
  relationships.forEach((relationship) => {
    if (
      !PARTNER_TYPES.has(relationship.type) ||
      !validPerson(relationship.personAId) ||
      !validPerson(relationship.personBId)
    ) return;
    partnerRelationshipByKey.set(
      sortedKey([relationship.personAId, relationship.personBId]),
      relationship,
    );
  });

  const familyByPartnerKey = new Map();
  const ensurePartnerFamily = (partnerIds) => {
    const canonicalPartnerIds = [...new Set(partnerIds)].sort();
    const partners = [...canonicalPartnerIds].sort(
      (a, b) => (displayOrder.get(a) ?? 0) - (displayOrder.get(b) ?? 0),
    );
    const key = canonicalPartnerIds.join('|');
    if (!familyByPartnerKey.has(key)) {
      const partnerRelationship = partnerRelationshipByKey.get(key);
      familyByPartnerKey.set(key, {
        id: `family:${key}`,
        partners,
        children: [],
        kind: 'family',
        relationshipType: partnerRelationship?.type || (partners.length === 2 ? 'co-parent' : 'single-parent'),
        relationshipId: partnerRelationship?.id,
        displayOrder: Math.min(...partners.map((id) => displayOrder.get(id) ?? Number.MAX_SAFE_INTEGER)),
      });
    }
    return familyByPartnerKey.get(key);
  };

  [...parentIdsByChild.entries()]
    .sort((a, b) => (displayOrder.get(a[0]) ?? 0) - (displayOrder.get(b[0]) ?? 0))
    .forEach(([childId, parentIds]) => {
      const family = ensurePartnerFamily(parentIds);
      if (!family.children.includes(childId)) family.children.push(childId);
    });

  partnerRelationshipByKey.forEach((relationship) => {
    ensurePartnerFamily([relationship.personAId, relationship.personBId]);
  });

  const siblingRelationships = relationships.filter(
    (relationship) =>
      relationship.type === 'sibling' &&
      validPerson(relationship.personAId) &&
      validPerson(relationship.personBId),
  );
  const siblingPersonIds = [...new Set(siblingRelationships.flatMap(
    (relationship) => [relationship.personAId, relationship.personBId],
  ))];
  const siblingUnion = makeUnionFind(siblingPersonIds);
  siblingRelationships.forEach((relationship) => siblingUnion.union(relationship.personAId, relationship.personBId));

  const siblingGroups = new Map();
  siblingPersonIds.forEach((personId) => {
    const root = siblingUnion.find(personId);
    siblingGroups.set(root, [...(siblingGroups.get(root) || []), personId]);
  });

  const virtualFamilies = [...siblingGroups.values()].map((children) => {
    const orderedChildren = [...children].sort(
      (a, b) => (displayOrder.get(a) ?? 0) - (displayOrder.get(b) ?? 0),
    );
    return {
      id: `siblings:${orderedChildren[0]}`,
      partners: [],
      children: orderedChildren,
      kind: 'virtual-sibling',
      relationshipType: 'sibling',
      displayOrder: Math.min(...orderedChildren.map((id) => displayOrder.get(id) ?? Number.MAX_SAFE_INTEGER)),
    };
  });

  const familyUnits = [...familyByPartnerKey.values(), ...virtualFamilies];
  familyUnits.sort((a, b) => a.displayOrder - b.displayOrder);
  familyUnits.forEach((family) => {
    family.orderMode = familyBirthOrderMode(family.children, peopleById);
    family.children.sort((a, b) => {
      if (family.orderMode !== 'manual') {
        const precision = family.orderMode.replace('birth-', '');
        const length = precisionLength[precision] || precisionLength.day;
        const dates = peopleById.get(a).birthDate.slice(0, length)
          .localeCompare(peopleById.get(b).birthDate.slice(0, length));
        if (dates) return dates;
      }
      const indexA = peopleById.get(a).familyOrder?.[family.id];
      const indexB = peopleById.get(b).familyOrder?.[family.id];
      const orderA = Number.isFinite(indexA) ? indexA : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(indexB) ? indexB : Number.MAX_SAFE_INTEGER;
      return orderA - orderB || displayOrder.get(a) - displayOrder.get(b);
    });
  });
  const parentFamilyByPerson = new Map();
  const partnerFamilyIdsByPerson = new Map();

  familyUnits.forEach((family) => {
    family.partners.forEach((personId) => {
      partnerFamilyIdsByPerson.set(personId, [
        ...(partnerFamilyIdsByPerson.get(personId) || []),
        family.id,
      ]);
    });
    if (family.kind === 'family') {
      family.children.forEach((personId) => {
        if (!parentFamilyByPerson.has(personId)) parentFamilyByPerson.set(personId, family.id);
      });
    }
  });

  return {
    familyUnits,
    parentFamilyByPerson,
    partnerFamilyIdsByPerson,
  };
}

export function getSiblingFamily(people, relationships, personId) {
  const { familyUnits } = buildFamilyUnits(people, relationships);
  return familyUnits.find((family) => family.kind === 'family' && family.children.includes(personId))
    || familyUnits.find((family) => family.children.includes(personId));
}

export function moveSibling(people, relationships, personId, direction) {
  const family = getSiblingFamily(people, relationships, personId);
  const index = family?.children.indexOf(personId) ?? -1;
  const nextIndex = index + direction;
  if (!family || family.orderMode !== 'manual' || ![-1, 1].includes(direction) ||
      index < 0 || nextIndex < 0 || nextIndex >= family.children.length) return null;
  const children = [...family.children];
  [children[index], children[nextIndex]] = [children[nextIndex], children[index]];
  const order = new Map(children.map((id, position) => [id, position]));
  const updated = people.map((person) => order.has(person.id)
    ? { ...person, familyOrder: { ...person.familyOrder, [family.id]: order.get(person.id) } }
    : person);
  return { people: updated, changedPeople: updated.filter((person) => order.has(person.id)) };
}
