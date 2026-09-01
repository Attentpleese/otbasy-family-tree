import { getPersonName } from '../domain/familyGraph';

export const TREE_CARD_WIDTH = 232;
export const TREE_CARD_HEIGHT = 112;

const GAP_BETWEEN_PARTNERS = 32;
const GAP_BETWEEN_FAMILIES = 68;
const GAP_Y = 92;
const PAD_X = 72;
const PAD_Y = 56;

export const cardCenter = (position) => ({
  x: position.x + TREE_CARD_WIDTH / 2,
  y: position.y + TREE_CARD_HEIGHT / 2,
});

export function getChildConnectionGeometry(connection, positions) {
  const parentPositions = connection.parentIds.map((id) => positions.get(id)).filter(Boolean);
  const childPositions = connection.childrenIds.map((id) => positions.get(id)).filter(Boolean);
  if (!parentPositions.length || !childPositions.length) return null;

  const parentCenters = parentPositions.map(cardCenter);
  const childCenters = childPositions.map(cardCenter);
  const sourceX = parentCenters.reduce((sum, center) => sum + center.x, 0) / parentCenters.length;
  const sourceY = Math.max(...parentPositions.map((position) => position.y + TREE_CARD_HEIGHT));
  const branchY = Math.min(...childPositions.map((position) => position.y)) - 22;

  return {
    sourceX,
    sourceY,
    branchY,
    childPositions,
    childCenters,
    minBranchX: Math.min(sourceX, ...childCenters.map((center) => center.x)),
    maxBranchX: Math.max(sourceX, ...childCenters.map((center) => center.x)),
  };
}

const pairKey = (ids) => [...ids].sort().join('|');

export function buildFamilyTreeLayout(people, relationships) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const parentEdges = relationships.filter(
    (relationship) =>
      relationship.type === 'parent-child' &&
      peopleById.has(relationship.parentId) &&
      peopleById.has(relationship.childId),
  );
  const coupleEdges = relationships.filter(
    (relationship) =>
      ['spouse', 'partner', 'divorced'].includes(relationship.type) &&
      peopleById.has(relationship.personAId) &&
      peopleById.has(relationship.personBId),
  );

  // Partners are one layout unit, so adding a spouse can never put that card
  // into an unrelated generation.
  const parent = new Map(people.map((person) => [person.id, person.id]));
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
  coupleEdges.forEach((relationship) => union(relationship.personAId, relationship.personBId));

  const componentByPerson = new Map(people.map((person) => [person.id, find(person.id)]));
  const membersByComponent = new Map();
  people.forEach((person) => {
    const componentId = componentByPerson.get(person.id);
    membersByComponent.set(componentId, [...(membersByComponent.get(componentId) || []), person]);
  });

  const parentComponentsByChild = new Map();
  parentEdges.forEach((relationship) => {
    const parentComponent = componentByPerson.get(relationship.parentId);
    const childComponent = componentByPerson.get(relationship.childId);
    if (parentComponent === childComponent) return;
    const current = parentComponentsByChild.get(childComponent) || new Set();
    current.add(parentComponent);
    parentComponentsByChild.set(childComponent, current);
  });

  const rankByComponent = new Map();
  const rankOf = (componentId, visiting = new Set()) => {
    if (rankByComponent.has(componentId)) return rankByComponent.get(componentId);
    if (visiting.has(componentId)) return 0;
    const nextVisiting = new Set(visiting).add(componentId);
    const parentComponents = [...(parentComponentsByChild.get(componentId) || [])];
    const rank = parentComponents.length
      ? Math.max(...parentComponents.map((id) => rankOf(id, nextVisiting))) + 1
      : 0;
    rankByComponent.set(componentId, rank);
    return rank;
  };
  membersByComponent.forEach((_members, componentId) => rankOf(componentId));

  const componentsByRank = new Map();
  membersByComponent.forEach((members, componentId) => {
    members.sort((a, b) => getPersonName(a).localeCompare(getPersonName(b)));
    const rank = rankByComponent.get(componentId) || 0;
    componentsByRank.set(rank, [...(componentsByRank.get(rank) || []), { id: componentId, members }]);
  });

  const componentOrder = new Map();
  const ranks = [...componentsByRank.keys()].sort((a, b) => a - b);
  ranks.forEach((rank) => {
    const components = componentsByRank.get(rank);
    components.sort((a, b) => {
      const parentOrder = (component) => {
        const parents = [...(parentComponentsByChild.get(component.id) || [])];
        if (!parents.length) return Number.MAX_SAFE_INTEGER;
        return parents.reduce((sum, id) => sum + (componentOrder.get(id) || 0), 0) / parents.length;
      };
      return parentOrder(a) - parentOrder(b) || getPersonName(a.members[0]).localeCompare(getPersonName(b.members[0]));
    });
    components.forEach((component, index) => componentOrder.set(component.id, index));
  });

  const rankWidths = new Map();
  ranks.forEach((rank) => {
    const components = componentsByRank.get(rank);
    const width = components.reduce((total, component, index) => {
      const blockWidth =
        component.members.length * TREE_CARD_WIDTH +
        Math.max(0, component.members.length - 1) * GAP_BETWEEN_PARTNERS;
      return total + blockWidth + (index ? GAP_BETWEEN_FAMILIES : 0);
    }, 0);
    rankWidths.set(rank, width);
  });

  const canvasWidth = Math.max(760, ...rankWidths.values()) + PAD_X * 2;
  const positions = new Map();
  ranks.forEach((rank) => {
    let cursorX = (canvasWidth - rankWidths.get(rank)) / 2;
    componentsByRank.get(rank).forEach((component, componentIndex) => {
      if (componentIndex) cursorX += GAP_BETWEEN_FAMILIES;
      component.members.forEach((person, memberIndex) => {
        if (memberIndex) cursorX += GAP_BETWEEN_PARTNERS;
        positions.set(person.id, {
          x: cursorX,
          y: PAD_Y + rank * (TREE_CARD_HEIGHT + GAP_Y),
        });
        cursorX += TREE_CARD_WIDTH;
      });
    });
  });

  const parentsByChild = new Map();
  parentEdges.forEach((relationship) => {
    parentsByChild.set(relationship.childId, [
      ...(parentsByChild.get(relationship.childId) || []),
      relationship.parentId,
    ]);
  });

  const childrenByParentSet = new Map();
  parentsByChild.forEach((parentIds, childId) => {
    const key = pairKey(parentIds);
    const group = childrenByParentSet.get(key) || { parentIds: [...parentIds].sort(), childrenIds: [] };
    group.childrenIds.push(childId);
    childrenByParentSet.set(key, group);
  });

  const childConnections = [...childrenByParentSet.values()]
    .map((connection) => ({
      ...connection,
      childrenIds: connection.childrenIds.filter((id) => positions.has(id)),
    }))
    .filter(
      (connection) =>
        connection.childrenIds.length > 0 && connection.parentIds.every((id) => positions.has(id)),
    );

  return {
    people,
    positions,
    coupleConnections: coupleEdges.map((relationship) => ({
      relationship,
      a: positions.get(relationship.personAId),
      b: positions.get(relationship.personBId),
    })),
    childConnections,
    width: canvasWidth,
    height: Math.max(
      520,
      (Math.max(0, ...ranks) + 1) * TREE_CARD_HEIGHT + Math.max(0, ranks.length - 1) * GAP_Y + PAD_Y * 2,
    ),
  };
}
