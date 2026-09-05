import {
  cardCenter,
  PARTNER_GAP,
  TREE_CARD_WIDTH,
} from './treeGeometry';

const PARTNER_TYPES = new Set(['spouse', 'partner', 'divorced']);
const DISTANT_COUPLE_TOLERANCE = 8;
const DISTANT_ROUTE_GAP = 72;
const DISTANT_ROUTE_LANE_GAP = 16;

const path = (...commands) => commands.join(' ');

export const getUnionAnchor = (parentPositions) => {
  const centers = parentPositions.map(cardCenter);
  return {
    x: centers.reduce((sum, center) => sum + center.x, 0) / centers.length,
    y: parentPositions.length > 1
      ? centers.reduce((sum, center) => sum + center.y, 0) / centers.length
      : parentPositions[0].y + parentPositions[0].height,
  };
};

export const isDistantCouple = (layout, personAId, personBId) => {
  const positionA = layout.positions.get(personAId);
  const positionB = layout.positions.get(personBId);
  if (!positionA || !positionB) return false;

  const generationA = layout.generations.get(personAId);
  const generationB = layout.generations.get(personBId);
  if (generationA !== generationB) return true;

  const centerA = cardCenter(positionA);
  const centerB = cardCenter(positionB);
  const minX = Math.min(centerA.x, centerB.x);
  const maxX = Math.max(centerA.x, centerB.x);
  const hasCardBetween = [...layout.positions.entries()].some(([personId, position]) => {
    if (personId === personAId || personId === personBId) return false;
    if (layout.generations.get(personId) !== generationA) return false;
    const x = cardCenter(position).x;
    return x > minX + DISTANT_COUPLE_TOLERANCE
      && x < maxX - DISTANT_COUPLE_TOLERANCE;
  });
  const adjacentDistance = TREE_CARD_WIDTH + PARTNER_GAP + DISTANT_COUPLE_TOLERANCE;

  return hasCardBetween || Math.abs(centerB.x - centerA.x) > adjacentDistance;
};

export const getCloseFamilyPath = (layout, personId) => {
  const familyById = new Map(layout.familyUnits.map((family) => [family.id, family]));
  const familyIds = new Set();
  const coupleIds = new Set();
  const childIdsByFamily = new Map();
  const addFamily = (family, childIds = []) => {
    if (!family || family.kind !== 'family') return;
    familyIds.add(family.id);
    childIdsByFamily.set(family.id, new Set(childIds));
    if (family.partners.length === 2) {
      coupleIds.add(family.relationshipId || `${family.id}:couple`);
    }
  };

  const parentFamily = familyById.get(layout.parentFamilyByPerson.get(personId));
  addFamily(parentFamily, [personId]);

  const ownFamilyIds = layout.partnerFamilyIdsByPerson.get(personId) || [];
  ownFamilyIds.forEach((familyId) => {
    const family = familyById.get(familyId);
    if (!family) return;
    if (family.children.length) addFamily(family, family.children);
    else if (family.partners.length === 2) {
      coupleIds.add(family.relationshipId || `${family.id}:couple`);
    }
  });

  return { familyIds, coupleIds, childIdsByFamily };
};

export const getFamilyBusHighlightSegments = (connection, activeChildIds) => {
  if (!activeChildIds?.size || connection.childAnchors.length < 2) return [];
  const allChildrenActive = connection.childAnchors.every(
    ({ childId }) => activeChildIds.has(childId),
  );
  if (allChildrenActive) return [];

  return connection.childAnchors
    .filter(({ childId }) => activeChildIds.has(childId))
    .map(({ childId, x }) => ({
      childId,
      fromX: connection.sourceX,
      toX: x,
      path: path(`M ${connection.sourceX} ${connection.busY}`, `H ${x}`),
    }));
};

export function routeConnections(layout, relationships) {
  const { positions, familyUnits } = layout;
  const relationshipByPair = new Map();
  relationships.forEach((relationship) => {
    if (!PARTNER_TYPES.has(relationship.type)) return;
    relationshipByPair.set(
      [relationship.personAId, relationship.personBId].sort().join('|'),
      relationship,
    );
  });

  const coupleConnections = [];
  const familyConnections = [];
  const distantLanes = new Map();
  const childFamilyIds = new Set(familyUnits
    .filter((family) => family.kind === 'family' && family.children.length)
    .flatMap((family) => family.partners));

  const routeDistantCouple = (personAId, personBId, positionA, positionB) => {
    const generation = Math.min(
      layout.generations.get(personAId) ?? 0,
      layout.generations.get(personBId) ?? 0,
    );
    const aboveBusy = layout.parentFamilyByPerson.has(personAId) ||
      layout.parentFamilyByPerson.has(personBId);
    const belowBusy = childFamilyIds.has(personAId) || childFamilyIds.has(personBId);
    const aboveKey = `${generation}:above`;
    const belowKey = `${generation}:below`;
    let side;
    if (aboveBusy && !belowBusy) side = 'below';
    else if (belowBusy && !aboveBusy) side = 'above';
    else side = (distantLanes.get(aboveKey) || 0) <= (distantLanes.get(belowKey) || 0)
      ? 'above'
      : 'below';

    const laneKey = side === 'above' ? aboveKey : belowKey;
    const lane = distantLanes.get(laneKey) || 0;
    distantLanes.set(laneKey, lane + 1);
    const routeGap = DISTANT_ROUTE_GAP + lane * DISTANT_ROUTE_LANE_GAP;
    const centerA = cardCenter(positionA);
    const centerB = cardCenter(positionB);
    const attachYA = side === 'above' ? positionA.y : positionA.y + positionA.height;
    const attachYB = side === 'above' ? positionB.y : positionB.y + positionB.height;
    const channelY = side === 'above'
      ? Math.min(positionA.y, positionB.y) - routeGap
      : Math.max(positionA.y + positionA.height, positionB.y + positionB.height) + routeGap;

    return {
      path: path(
        `M ${centerA.x} ${attachYA}`,
        `V ${channelY}`,
        `H ${centerB.x}`,
        `V ${attachYB}`,
      ),
      routeSide: side,
      channelY,
    };
  };

  familyUnits.forEach((family) => {
    if (family.kind !== 'family') return;
    const parentPositions = family.partners.map((id) => positions.get(id)).filter(Boolean);
    const childPositions = family.children.map((id) => positions.get(id)).filter(Boolean);
    if (!parentPositions.length) return;

    const parentCenters = parentPositions.map(cardCenter);
    if (parentPositions.length === 2) {
      const relationship = relationshipByPair.get([...family.partners].sort().join('|'));
      const distant = isDistantCouple(layout, family.partners[0], family.partners[1]);
      const routedCouple = distant
        ? routeDistantCouple(
          family.partners[0],
          family.partners[1],
          parentPositions[0],
          parentPositions[1],
        )
        : {
          path: path(
            `M ${parentCenters[0].x} ${parentCenters[0].y}`,
            `H ${parentCenters[1].x}`,
          ),
          routeSide: 'direct',
        };
      coupleConnections.push({
        id: relationship?.id || `${family.id}:couple`,
        type: relationship?.type || family.relationshipType,
        personIds: [...family.partners],
        distant,
        ...routedCouple,
      });
    }
    if (!childPositions.length) return;

    // Positions already contain all strict ancestry constraints. Compute the
    // descendant anchor only now, from both partners' final card centers.
    const unionAnchor = getUnionAnchor(parentPositions);
    const sourceX = unionAnchor.x;
    const sourceY = unionAnchor.y;
    const childAnchors = family.children.map((childId) => {
      const position = positions.get(childId);
      return position ? {
        childId,
        x: cardCenter(position).x,
        y: position.y,
      } : null;
    }).filter(Boolean);
    const childTop = Math.min(...childAnchors.map((anchor) => anchor.y));
    const busY = sourceY + (childTop - sourceY) / 2;

    if (childAnchors.length === 1) {
      const segments = [{
        role: 'branch',
        childId: family.children[0],
        path: path(
          `M ${sourceX} ${sourceY}`,
          `V ${busY}`,
          `H ${childAnchors[0].x}`,
          `V ${childAnchors[0].y}`,
        ),
      }];
      familyConnections.push({
        id: family.id,
        sourceX,
        sourceY,
        busY,
        childAnchors,
        segments,
        paths: segments.map((segment) => segment.path),
      });
      return;
    }

    // The stem must always meet the sibling bus, even when a constrained
    // parent pair sits outside the current span of its children.
    const minX = Math.min(sourceX, ...childAnchors.map((anchor) => anchor.x));
    const maxX = Math.max(sourceX, ...childAnchors.map((anchor) => anchor.x));
    const segments = [
      { role: 'stem', path: path(`M ${sourceX} ${sourceY}`, `V ${busY}`) },
      { role: 'bus', path: path(`M ${minX} ${busY}`, `H ${maxX}`) },
      ...childAnchors.map((anchor) => ({
        role: 'child-drop',
        childId: anchor.childId,
        path: path(`M ${anchor.x} ${busY}`, `V ${anchor.y}`),
      })),
    ];
    familyConnections.push({
      id: family.id,
      sourceX,
      sourceY,
      busY,
      childAnchors,
      segments,
      paths: segments.map((segment) => segment.path),
    });
  });

  return { coupleConnections, familyConnections };
}
