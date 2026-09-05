export const PARTNER_SNAP_DISTANCE = 256;
export const SIBLING_SNAP_DISTANCE = 272;
export const SNAP_THRESHOLD = 20;

const ACTIVE_PARTNER_TYPES = new Set(['spouse', 'partner']);

const pairKey = (a, b) => [a, b].sort().join('|');

export function getDragGroupPersonIds(relationships, personId) {
  const childrenByParent = new Map();
  const partnersByPerson = new Map();

  relationships.forEach((relationship) => {
    if (relationship.type === 'parent-child' && relationship.parentId && relationship.childId) {
      if (!childrenByParent.has(relationship.parentId)) childrenByParent.set(relationship.parentId, []);
      childrenByParent.get(relationship.parentId).push(relationship.childId);
      return;
    }
    if (!ACTIVE_PARTNER_TYPES.has(relationship.type)) return;
    if (!relationship.personAId || !relationship.personBId) return;
    if (!partnersByPerson.has(relationship.personAId)) partnersByPerson.set(relationship.personAId, []);
    if (!partnersByPerson.has(relationship.personBId)) partnersByPerson.set(relationship.personBId, []);
    partnersByPerson.get(relationship.personAId).push(relationship.personBId);
    partnersByPerson.get(relationship.personBId).push(relationship.personAId);
  });

  const affected = new Set();
  const visitedDescendants = new Set();
  const queue = [personId];

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visitedDescendants.has(currentId)) continue;
    visitedDescendants.add(currentId);
    affected.add(currentId);
    (partnersByPerson.get(currentId) || []).forEach((partnerId) => affected.add(partnerId));
    (childrenByParent.get(currentId) || []).forEach((childId) => {
      if (!visitedDescendants.has(childId)) queue.push(childId);
    });
  }

  return affected;
}

export function buildDragPreviewPositions(initialXByPerson, leaderId, leaderX) {
  const initialLeaderX = initialXByPerson.get(leaderId);
  if (!Number.isFinite(initialLeaderX) || !Number.isFinite(leaderX)) return new Map();
  const deltaX = leaderX - initialLeaderX;
  return new Map([...initialXByPerson.entries()]
    .filter(([, x]) => Number.isFinite(x))
    .map(([id, x]) => [id, x + deltaX]));
}

export async function commitFreeXGroupMove({
  people,
  xByPerson,
  persistChangedPeople,
  rememberCurrentGraph,
  applyPeople,
}) {
  const changedPeople = [];
  const nextPeople = people.map((person) => {
    const nextX = xByPerson.get(person.id);
    const isUnchanged = Number.isFinite(person.layoutX)
      && Math.abs(nextX - person.layoutX) <= 0.001;
    if (!Number.isFinite(nextX) || isUnchanged) return person;
    const nextPerson = { ...person, layoutX: nextX };
    changedPeople.push(nextPerson);
    return nextPerson;
  });

  if (!changedPeople.length) return { error: null, changedPeople, nextPeople: people };
  if (persistChangedPeople) {
    const result = await persistChangedPeople(changedPeople);
    if (result?.error) return { error: result.error, changedPeople: [], nextPeople: people };
  }

  rememberCurrentGraph();
  applyPeople(nextPeople);
  return { error: null, changedPeople, nextPeople };
}

export function snapFreeXPosition({
  layout,
  relationships,
  personId,
  proposedX,
  threshold = SNAP_THRESHOLD,
  excludedPersonIds = new Set(),
}) {
  const position = layout.positions.get(personId);
  if (!position || !Number.isFinite(proposedX)) return { x: proposedX, snappedToPersonId: null };

  const generation = layout.generations.get(personId);
  const proposedCenter = proposedX + position.width / 2;
  const sameRow = [...layout.positions.entries()]
    .filter(([id]) => id !== personId
      && !excludedPersonIds.has(id)
      && layout.generations.get(id) === generation)
    .map(([id, item]) => ({ id, center: item.x + item.width / 2, width: item.width }))
    .sort((a, b) => a.center - b.center);
  const left = [...sameRow].reverse().find((item) => item.center <= proposedCenter);
  const right = sameRow.find((item) => item.center > proposedCenter);
  const relationshipByPair = new Map(relationships
    .filter((relationship) => relationship.personAId && relationship.personBId)
    .map((relationship) => [pairKey(relationship.personAId, relationship.personBId), relationship.type]));
  const parentFamilyId = layout.parentFamilyByPerson.get(personId);

  const candidates = [left, right].filter(Boolean).flatMap((neighbor) => {
    const relationshipType = relationshipByPair.get(pairKey(personId, neighbor.id));
    const isPartner = ACTIVE_PARTNER_TYPES.has(relationshipType);
    const isSibling = relationshipType === 'sibling' || (
      parentFamilyId && parentFamilyId === layout.parentFamilyByPerson.get(neighbor.id)
    );
    if (!isPartner && !isSibling) return [];

    const targetDistance = isPartner ? PARTNER_SNAP_DISTANCE : SIBLING_SNAP_DISTANCE;
    const direction = proposedCenter <= neighbor.center ? -1 : 1;
    const snappedCenter = neighbor.center + direction * targetDistance;
    const x = snappedCenter - position.width / 2;
    return [{
      x,
      snappedToPersonId: neighbor.id,
      targetDistance,
      correction: Math.abs(x - proposedX),
    }];
  }).filter((candidate) => candidate.correction <= threshold);

  if (!candidates.length) return { x: proposedX, snappedToPersonId: null };
  return candidates.sort((a, b) =>
    a.correction - b.correction || a.targetDistance - b.targetDistance)[0];
}
