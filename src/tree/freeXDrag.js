export const PARTNER_SNAP_DISTANCE = 256;
export const SIBLING_SNAP_DISTANCE = 272;
export const SNAP_THRESHOLD = 20;

const ACTIVE_PARTNER_TYPES = new Set(['spouse', 'partner']);

const pairKey = (a, b) => [a, b].sort().join('|');

export function snapFreeXPosition({
  layout,
  relationships,
  personId,
  proposedX,
  threshold = SNAP_THRESHOLD,
}) {
  const position = layout.positions.get(personId);
  if (!position || !Number.isFinite(proposedX)) return { x: proposedX, snappedToPersonId: null };

  const generation = layout.generations.get(personId);
  const proposedCenter = proposedX + position.width / 2;
  const sameRow = [...layout.positions.entries()]
    .filter(([id]) => id !== personId && layout.generations.get(id) === generation)
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
