import { getPersonDisplayName } from '../domain/familyGraph';

export const TREE_CARD_WIDTH = 232;
export const TREE_CARD_HEIGHT = 112;

const GAP_BETWEEN_PARTNERS = 32;
const GAP_BETWEEN_FAMILIES = 68;
const GAP_BETWEEN_SIBLINGS = 40;
const GAP_Y = 92;
const PAD_X = 72;
const PAD_Y = 56;

export const cardCenter = (position) => ({
  x: position.x + TREE_CARD_WIDTH / 2,
  y: position.y + TREE_CARD_HEIGHT / 2,
});

export const getChildConnectionPath = (geometry, childPosition) => {
  const childCenter = cardCenter(childPosition);
  return `M ${geometry.sourceX} ${geometry.sourceY} V ${geometry.branchY} H ${childCenter.x} V ${childPosition.y}`;
};

export function getChildConnectionGeometry(connection, positions) {
  const parentPositions = connection.parentIds.map((id) => positions.get(id)).filter(Boolean);
  const childPositions = connection.childrenIds.map((id) => positions.get(id)).filter(Boolean);
  if (!parentPositions.length || !childPositions.length) return null;

  const parentCenters = parentPositions.map(cardCenter);
  const childCenters = childPositions.map(cardCenter);
  const sourceX = parentCenters.reduce((sum, center) => sum + center.x, 0) / parentCenters.length;
  const sourceY = parentPositions.length > 1
    ? parentCenters.reduce((sum, center) => sum + center.y, 0) / parentCenters.length
    : parentPositions[0].y + TREE_CARD_HEIGHT;
  const childTop = Math.min(...childPositions.map((position) => position.y));
  const branchY = sourceY + (childTop - sourceY) / 2;

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
  const siblingEdges = relationships.filter(
    (relationship) =>
      relationship.type === 'sibling' &&
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
  [...coupleEdges, ...siblingEdges]
    .forEach((relationship) => union(relationship.personAId, relationship.personBId));

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

  membersByComponent.forEach((members) => {
    members.sort((a, b) => getPersonDisplayName(a).localeCompare(getPersonDisplayName(b)));
  });

  const parentComponentsByPerson = new Map();
  const childComponentsByParent = new Map();
  parentEdges.forEach((relationship) => {
    const parentComponent = componentByPerson.get(relationship.parentId);
    const childComponent = componentByPerson.get(relationship.childId);
    if (parentComponent === childComponent) return;

    const personParents = parentComponentsByPerson.get(relationship.childId) || new Set();
    personParents.add(parentComponent);
    parentComponentsByPerson.set(relationship.childId, personParents);

    const componentChildren = childComponentsByParent.get(parentComponent) || new Set();
    componentChildren.add(childComponent);
    childComponentsByParent.set(parentComponent, componentChildren);
  });

  const widthByComponent = new Map();
  const branchesByComponent = new Map();
  const measureComponent = (componentId, visiting = new Set()) => {
    if (widthByComponent.has(componentId)) return widthByComponent.get(componentId);
    if (visiting.has(componentId)) return TREE_CARD_WIDTH;

    const nextVisiting = new Set(visiting).add(componentId);
    const branches = membersByComponent.get(componentId).map((person) => {
      const parentIds = [...(parentComponentsByPerson.get(person.id) || [])]
        .filter((id) => id !== componentId)
        .sort();
      const parentWidths = parentIds.map((id) => measureComponent(id, nextVisiting));
      const parentsWidth = parentWidths.reduce(
        (total, width, index) => total + width + (index ? GAP_BETWEEN_FAMILIES : 0),
        0,
      );
      return {
        person,
        parentIds,
        parentWidths,
        width: Math.max(TREE_CARD_WIDTH, parentsWidth),
      };
    });

    const gaps = branches.slice(1).map((branch, index) =>
      branch.width > TREE_CARD_WIDTH || branches[index].width > TREE_CARD_WIDTH
        ? GAP_BETWEEN_FAMILIES
        : GAP_BETWEEN_PARTNERS,
    );
    const width = branches.reduce((total, branch) => total + branch.width, 0)
      + gaps.reduce((total, gap) => total + gap, 0);

    branchesByComponent.set(componentId, { branches, gaps });
    widthByComponent.set(componentId, Math.max(TREE_CARD_WIDTH, width));
    return widthByComponent.get(componentId);
  };

  const positions = new Map();
  const placedComponents = new Set();
  const placeComponent = (componentId, left, visiting = new Set()) => {
    if (placedComponents.has(componentId) || visiting.has(componentId)) return;
    placedComponents.add(componentId);
    const nextVisiting = new Set(visiting).add(componentId);
    if (!branchesByComponent.has(componentId)) measureComponent(componentId);
    const { branches, gaps } = branchesByComponent.get(componentId);
    let branchLeft = left;

    branches.forEach((branch, index) => {
      const centerX = branchLeft + branch.width / 2;
      positions.set(branch.person.id, {
        x: centerX - TREE_CARD_WIDTH / 2,
        y: PAD_Y + (rankByComponent.get(componentId) || 0) * (TREE_CARD_HEIGHT + GAP_Y),
      });

      const parentsWidth = branch.parentWidths.reduce(
        (total, width, parentIndex) => total + width + (parentIndex ? GAP_BETWEEN_FAMILIES : 0),
        0,
      );
      let parentLeft = branchLeft + (branch.width - parentsWidth) / 2;
      branch.parentIds.forEach((parentId, parentIndex) => {
        placeComponent(parentId, parentLeft, nextVisiting);
        parentLeft += branch.parentWidths[parentIndex] + GAP_BETWEEN_FAMILIES;
      });

      branchLeft += branch.width + (gaps[index] || 0);
    });
  };

  const localComponentWidth = (componentId) => {
    const memberCount = membersByComponent.get(componentId).length;
    return memberCount * TREE_CARD_WIDTH + Math.max(0, memberCount - 1) * GAP_BETWEEN_PARTNERS;
  };
  const descendantWidthByComponent = new Map();
  const measureDescendants = (componentId, visiting = new Set()) => {
    if (descendantWidthByComponent.has(componentId)) return descendantWidthByComponent.get(componentId);
    if (visiting.has(componentId)) return localComponentWidth(componentId);
    const nextVisiting = new Set(visiting).add(componentId);
    const childIds = [...(childComponentsByParent.get(componentId) || [])];
    const childWidths = childIds.map((id) => measureDescendants(id, nextVisiting));
    const childrenWidth = childWidths.reduce(
      (total, width, index) => total + width + (index ? GAP_BETWEEN_SIBLINGS : 0),
      0,
    );
    const width = Math.max(localComponentWidth(componentId), childrenWidth);
    descendantWidthByComponent.set(componentId, width);
    return width;
  };

  const placeLocalComponent = (componentId, centerX) => {
    if (placedComponents.has(componentId)) return;
    placedComponents.add(componentId);
    const members = membersByComponent.get(componentId);
    let cursorX = centerX - localComponentWidth(componentId) / 2;
    members.forEach((person, index) => {
      positions.set(person.id, {
        x: cursorX,
        y: PAD_Y + (rankByComponent.get(componentId) || 0) * (TREE_CARD_HEIGHT + GAP_Y),
      });
      cursorX += TREE_CARD_WIDTH + (index < members.length - 1 ? GAP_BETWEEN_PARTNERS : 0);
    });
  };

  const placeDescendants = (componentId, visiting = new Set()) => {
    if (visiting.has(componentId)) return;
    const nextVisiting = new Set(visiting).add(componentId);
    const childIds = [...(childComponentsByParent.get(componentId) || [])]
      .filter((id) => !placedComponents.has(id))
      .sort((a, b) => getPersonDisplayName(membersByComponent.get(a)[0])
        .localeCompare(getPersonDisplayName(membersByComponent.get(b)[0])));
    if (!childIds.length) return;

    const childWidths = childIds.map((id) => measureDescendants(id));
    const groupWidth = childWidths.reduce(
      (total, width, index) => total + width + (index ? GAP_BETWEEN_SIBLINGS : 0),
      0,
    );
    const parentCenters = membersByComponent.get(componentId)
      .map((person) => positions.get(person.id))
      .filter(Boolean)
      .map(cardCenter);
    const parentCenterX = parentCenters.reduce((sum, center) => sum + center.x, 0) / parentCenters.length;
    let childLeft = parentCenterX - groupWidth / 2;

    childIds.forEach((childId, index) => {
      const childCenterX = childLeft + childWidths[index] / 2;
      placeLocalComponent(childId, childCenterX);
      placeDescendants(childId, nextVisiting);
      childLeft += childWidths[index] + GAP_BETWEEN_SIBLINGS;
    });
  };

  const componentNeighbors = new Map([...membersByComponent.keys()].map((id) => [id, new Set()]));
  parentEdges.forEach((relationship) => {
    const parentComponent = componentByPerson.get(relationship.parentId);
    const childComponent = componentByPerson.get(relationship.childId);
    if (parentComponent === childComponent) return;
    componentNeighbors.get(parentComponent).add(childComponent);
    componentNeighbors.get(childComponent).add(parentComponent);
  });

  const clusters = [];
  const clustered = new Set();
  membersByComponent.forEach((_members, startId) => {
    if (clustered.has(startId)) return;
    const cluster = [];
    const queue = [startId];
    clustered.add(startId);
    while (queue.length) {
      const componentId = queue.shift();
      cluster.push(componentId);
      componentNeighbors.get(componentId).forEach((neighborId) => {
        if (clustered.has(neighborId)) return;
        clustered.add(neighborId);
        queue.push(neighborId);
      });
    }
    clusters.push(cluster);
  });

  let clusterLeft = PAD_X;
  clusters.forEach((cluster) => {
    const focalComponent = [...cluster].sort((a, b) => {
      const degreeDifference = componentNeighbors.get(b).size - componentNeighbors.get(a).size;
      if (degreeDifference) return degreeDifference;
      return (rankByComponent.get(a) || 0) - (rankByComponent.get(b) || 0);
    })[0];
    const ancestryWidth = measureComponent(focalComponent);
    const descendantWidth = measureDescendants(focalComponent);
    const clusterWidth = Math.max(ancestryWidth, descendantWidth);
    placeComponent(focalComponent, clusterLeft + (clusterWidth - ancestryWidth) / 2);
    placeDescendants(focalComponent);

    cluster.forEach((componentId) => {
      if (placedComponents.has(componentId)) return;
      const width = measureComponent(componentId);
      placeComponent(componentId, clusterLeft + (clusterWidth - width) / 2);
      placeDescendants(componentId);
    });
    clusterLeft += clusterWidth + GAP_BETWEEN_FAMILIES * 2;
  });

  // Recursive ancestry and descendant placement can approach the same rank
  // from different branches. Separate complete same-level units once all
  // positions are known so a new sibling component can never overlap a
  // neighbouring couple or sibling group.
  const componentsByRank = new Map();
  membersByComponent.forEach((_members, componentId) => {
    const rank = rankByComponent.get(componentId) || 0;
    componentsByRank.set(rank, [...(componentsByRank.get(rank) || []), componentId]);
  });

  componentsByRank.forEach((componentIds) => {
    const bounds = componentIds
      .map((componentId) => {
        const memberPositions = membersByComponent.get(componentId)
          .map((person) => positions.get(person.id))
          .filter(Boolean);
        if (!memberPositions.length) return null;
        return {
          componentId,
          left: Math.min(...memberPositions.map((position) => position.x)),
          right: Math.max(...memberPositions.map((position) => position.x + TREE_CARD_WIDTH)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.left - b.left);

    let nextLeft = bounds[0]?.left ?? PAD_X;
    bounds.forEach((bound) => {
      const shift = Math.max(0, nextLeft - bound.left);
      if (shift) {
        membersByComponent.get(bound.componentId).forEach((person) => {
          const position = positions.get(person.id);
          positions.set(person.id, { ...position, x: position.x + shift });
        });
      }
      nextLeft = bound.right + shift + GAP_BETWEEN_PARTNERS;
    });
  });

  const rightEdge = Math.max(
    760,
    ...[...positions.values()].map((position) => position.x + TREE_CARD_WIDTH),
  );
  const canvasWidth = rightEdge + PAD_X;
  const ranks = [...rankByComponent.values()];

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
