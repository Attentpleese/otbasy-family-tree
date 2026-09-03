const PARTNER_TYPES = new Set(['spouse', 'partner', 'divorced']);
const ACTIVE_PARTNER_TYPES = new Set(['spouse', 'partner']);

export function buildDerivedPartnerHostMap({
  people,
  relationships,
  parentFamilyByPerson,
  partnerFamilyIdsByPerson,
  familyById,
  personOrder,
}) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const siblingIds = new Set();
  const partnerRelationshipsByPerson = new Map();

  relationships.forEach((relationship) => {
    if (relationship.type === 'sibling') {
      siblingIds.add(relationship.personAId);
      siblingIds.add(relationship.personBId);
    }
    if (!PARTNER_TYPES.has(relationship.type)) return;
    [relationship.personAId, relationship.personBId].forEach((personId) => {
      partnerRelationshipsByPerson.set(personId, [
        ...(partnerRelationshipsByPerson.get(personId) || []),
        relationship,
      ]);
    });
  });

  const isPureExternal = (personId, hostId, relationship) => {
    if (!peopleById.has(personId) || parentFamilyByPerson.has(personId) || siblingIds.has(personId)) return false;
    const hostParentFamily = familyById.get(parentFamilyByPerson.get(hostId));
    const hostHasMovableGroup = siblingIds.has(hostId) ||
      hostParentFamily?.children.length > 1 ||
      Number.isInteger(peopleById.get(hostId)?.familyLayoutOrder);
    if (!hostHasMovableGroup) return false;
    if ((partnerRelationshipsByPerson.get(personId) || []).length !== 1) return false;
    if ((partnerRelationshipsByPerson.get(hostId) || []).length !== 1) return false;
    const familyIds = partnerFamilyIdsByPerson.get(personId) || [];
    if (familyIds.length !== 1) return false;
    const family = familyById.get(familyIds[0]);
    return ACTIVE_PARTNER_TYPES.has(relationship.type) &&
      family?.partners.length === 2 &&
      family.partners.includes(personId) &&
      family.partners.includes(hostId);
  };

  const hostByExternal = new Map();
  relationships.forEach((relationship) => {
    if (!ACTIVE_PARTNER_TYPES.has(relationship.type)) return;
    const { personAId, personBId } = relationship;
    const aIsExternal = isPureExternal(personAId, personBId, relationship);
    const bIsExternal = isPureExternal(personBId, personAId, relationship);
    if (!aIsExternal && !bIsExternal) return;
    if (aIsExternal && bIsExternal) {
      const aOrder = personOrder.get(personAId) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = personOrder.get(personBId) ?? Number.MAX_SAFE_INTEGER;
      const externalId = aOrder > bOrder ? personAId : personBId;
      hostByExternal.set(externalId, externalId === personAId ? personBId : personAId);
      return;
    }
    hostByExternal.set(aIsExternal ? personAId : personBId, aIsExternal ? personBId : personAId);
  });

  return hostByExternal;
}
