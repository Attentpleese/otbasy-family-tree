import { PARTNER_SNAP_DISTANCE, SIBLING_SNAP_DISTANCE } from './freeXDrag';
import { TREE_CARD_WIDTH } from './treeGeometry';

const DEFAULT_INDEPENDENT_X = 72;
const MIN_CARD_GAP = 24;

const centerX = (position) => position.x + position.width / 2;

const rowPositions = (layout, generation, excludedIds = new Set()) =>
  [...layout.positions.entries()]
    .filter(([id]) => !excludedIds.has(id) && layout.generations.get(id) === generation)
    .map(([id, position]) => ({ id, ...position }));

const isFree = (x, occupied) => occupied.every((position) =>
  x + TREE_CARD_WIDTH + MIN_CARD_GAP <= position.x ||
  x >= position.x + position.width + MIN_CARD_GAP);

const nearestClearance = (x, occupied) => {
  const candidateCenter = x + TREE_CARD_WIDTH / 2;
  if (!occupied.length) return Infinity;
  return Math.min(...occupied.map((position) => Math.abs(candidateCenter - centerX(position))));
};

const pickSide = (leftX, rightX, occupied) => {
  const candidates = [
    { x: leftX, side: 'left', free: isFree(leftX, occupied), clearance: nearestClearance(leftX, occupied) },
    { x: rightX, side: 'right', free: isFree(rightX, occupied), clearance: nearestClearance(rightX, occupied) },
  ];
  return candidates.sort((a, b) =>
    Number(b.free) - Number(a.free) || b.clearance - a.clearance || (a.side === 'right' ? -1 : 1))[0];
};

const findNearestFreeSlot = ({ anchorX, occupied, includeCenter = true }) => {
  if (includeCenter && isFree(anchorX, occupied)) return anchorX;
  for (let distance = 1; distance <= occupied.length + 2; distance += 1) {
    const choice = pickSide(
      anchorX - SIBLING_SNAP_DISTANCE * distance,
      anchorX + SIBLING_SNAP_DISTANCE * distance,
      occupied,
    );
    if (choice.free) return choice.x;
  }
  return anchorX + SIBLING_SNAP_DISTANCE * (occupied.length + 2);
};

export const getInitialSpouseX = (layout, selectedId) => {
  const selected = layout.positions.get(selectedId);
  if (!selected) return DEFAULT_INDEPENDENT_X;
  const generation = layout.generations.get(selectedId) ?? 0;
  const occupied = rowPositions(layout, generation, new Set([selectedId]));
  return pickSide(
    selected.x - PARTNER_SNAP_DISTANCE,
    selected.x + PARTNER_SNAP_DISTANCE,
    occupied,
  ).x;
};

export const getInitialChildX = (layout, parentIds) => {
  const parents = parentIds.map((id) => layout.positions.get(id)).filter(Boolean);
  if (!parents.length) return DEFAULT_INDEPENDENT_X;
  const familyCenter = parents.reduce((sum, position) => sum + centerX(position), 0) / parents.length;
  const anchorX = familyCenter - TREE_CARD_WIDTH / 2;
  const parentGeneration = Math.min(...parentIds
    .map((id) => layout.generations.get(id))
    .filter(Number.isFinite));
  const childGeneration = Number.isFinite(parentGeneration) ? parentGeneration + 1 : 1;
  return findNearestFreeSlot({
    anchorX,
    occupied: rowPositions(layout, childGeneration),
  });
};

export const getInitialNewPartnerAndChildX = (layout, selectedId) => {
  const selected = layout.positions.get(selectedId);
  const partnerX = getInitialSpouseX(layout, selectedId);
  if (!selected) return { partnerX, childX: DEFAULT_INDEPENDENT_X };
  const virtualPartnerId = '__new-partner__';
  const positions = new Map(layout.positions);
  positions.set(virtualPartnerId, { ...selected, x: partnerX });
  const generations = new Map(layout.generations);
  generations.set(virtualPartnerId, layout.generations.get(selectedId) ?? 0);
  return {
    partnerX,
    childX: getInitialChildX({ ...layout, positions, generations }, [selectedId, virtualPartnerId]),
  };
};

export const getInitialSiblingX = (layout, selectedId) => {
  const selected = layout.positions.get(selectedId);
  if (!selected) return DEFAULT_INDEPENDENT_X;
  const generation = layout.generations.get(selectedId) ?? 0;
  const occupied = rowPositions(layout, generation, new Set([selectedId]));
  for (let distance = 1; distance <= occupied.length + 2; distance += 1) {
    const choice = pickSide(
      selected.x - SIBLING_SNAP_DISTANCE * distance,
      selected.x + SIBLING_SNAP_DISTANCE * distance,
      occupied,
    );
    if (choice.free) return choice.x;
  }
  return selected.x + SIBLING_SNAP_DISTANCE * (occupied.length + 2);
};

export const getInitialParentX = (layout, childId, existingParentIds = []) => {
  const child = layout.positions.get(childId);
  if (!child) return DEFAULT_INDEPENDENT_X;
  if (!existingParentIds.length) return child.x;
  return getInitialSpouseX(layout, existingParentIds[0]);
};

export const getInitialParentPairX = (layout, childId) => {
  const child = layout.positions.get(childId);
  const childCenter = child ? centerX(child) : DEFAULT_INDEPENDENT_X + TREE_CARD_WIDTH / 2;
  return {
    fatherX: childCenter - PARTNER_SNAP_DISTANCE / 2 - TREE_CARD_WIDTH / 2,
    motherX: childCenter + PARTNER_SNAP_DISTANCE / 2 - TREE_CARD_WIDTH / 2,
  };
};

export const getInitialIndependentX = (layout, generation = 0) => {
  const occupied = rowPositions(layout, generation);
  if (!occupied.length) return DEFAULT_INDEPENDENT_X;
  return Math.max(...occupied.map((position) => position.x + position.width)) + MIN_CARD_GAP;
};
