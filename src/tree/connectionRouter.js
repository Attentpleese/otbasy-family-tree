import { cardCenter } from './familyTreeLayout';

const PARTNER_TYPES = new Set(['spouse', 'partner', 'divorced']);

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

  familyUnits.forEach((family) => {
    if (family.kind !== 'family') return;
    const parentPositions = family.partners.map((id) => positions.get(id)).filter(Boolean);
    const childPositions = family.children.map((id) => positions.get(id)).filter(Boolean);
    if (!parentPositions.length) return;

    const parentCenters = parentPositions.map(cardCenter);
    if (parentPositions.length === 2) {
      const relationship = relationshipByPair.get([...family.partners].sort().join('|'));
      coupleConnections.push({
        id: relationship?.id || `${family.id}:couple`,
        type: relationship?.type || family.relationshipType,
        path: path(
          `M ${parentCenters[0].x} ${parentCenters[0].y}`,
          `H ${parentCenters[1].x}`,
        ),
      });
    }
    if (!childPositions.length) return;

    // Positions already contain all strict ancestry constraints. Compute the
    // descendant anchor only now, from both partners' final card centers.
    const unionAnchor = getUnionAnchor(parentPositions);
    const sourceX = unionAnchor.x;
    const sourceY = unionAnchor.y;
    const childAnchors = childPositions.map((position) => ({
      x: cardCenter(position).x,
      y: position.y,
    }));
    const childTop = Math.min(...childAnchors.map((anchor) => anchor.y));
    const busY = sourceY + (childTop - sourceY) / 2;

    if (childAnchors.length === 1) {
      familyConnections.push({
        id: family.id,
        sourceX,
        sourceY,
        busY,
        paths: [path(
          `M ${sourceX} ${sourceY}`,
          `V ${busY}`,
          `H ${childAnchors[0].x}`,
          `V ${childAnchors[0].y}`,
        )],
      });
      return;
    }

    // The stem must always meet the sibling bus, even when a constrained
    // parent pair sits outside the current span of its children.
    const minX = Math.min(sourceX, ...childAnchors.map((anchor) => anchor.x));
    const maxX = Math.max(sourceX, ...childAnchors.map((anchor) => anchor.x));
    familyConnections.push({
      id: family.id,
      sourceX,
      sourceY,
      busY,
      paths: [
        path(`M ${sourceX} ${sourceY}`, `V ${busY}`),
        path(`M ${minX} ${busY}`, `H ${maxX}`),
        ...childAnchors.map((anchor) => path(`M ${anchor.x} ${busY}`, `V ${anchor.y}`)),
      ],
    });
  });

  return { coupleConnections, familyConnections };
}
