import { buildFamilyUnits } from './familyUnits';
import {
  getFamilyRowGroupPersonIds,
  groupFamilyRow,
  orderByFamilies,
  orderFamilyRowGroups,
} from './familyRowGroups';
import { comparePersonDisplayOrder } from '../domain/familyGraph';

export const TREE_CARD_WIDTH = 232;
export const TREE_CARD_HEIGHT = 112;

export const SIBLING_GAP = 40;
export const PARTNER_GAP = 24;
export const FAMILY_GAP = 40;
export const ISLAND_GAP = 96;
export const GENERATION_GAP = 124;
const PAD_X = 72;
const PAD_Y = 56;

const keyForPair = (a, b) => [a, b].sort().join('|');
const PARTNER_TYPES = new Set(['spouse', 'partner', 'divorced']);

export const cardCenter = (position) => ({
  x: position.x + (position.width || TREE_CARD_WIDTH) / 2,
  y: position.y + (position.height || TREE_CARD_HEIGHT) / 2,
});

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

const compactRow = (blocks, desiredCenters, gapBetween = () => FAMILY_GAP) => {
  if (!blocks.length) return new Map();
  const centers = blocks.map((block) => desiredCenters.get(block.id) ?? block.center ?? 0);
  for (let index = 1; index < blocks.length; index += 1) {
    const minimum = centers[index - 1] + blocks[index - 1].width / 2 +
      gapBetween(blocks[index - 1], blocks[index]) + blocks[index].width / 2;
    centers[index] = Math.max(centers[index], minimum);
  }
  for (let index = blocks.length - 2; index >= 0; index -= 1) {
    const maximum = centers[index + 1] - blocks[index + 1].width / 2 -
      gapBetween(blocks[index], blocks[index + 1]) - blocks[index].width / 2;
    centers[index] = Math.min(centers[index], maximum);
  }
  const shift = blocks.reduce(
    (sum, block, index) => sum + (desiredCenters.get(block.id) ?? centers[index]) - centers[index],
    0,
  ) / blocks.length;
  return new Map(blocks.map((block, index) => [block.id, centers[index] + shift]));
};

const enforceStrictParentAnchors = ({
  blocks,
  blockById,
  blockIdByPerson,
  blockCenters,
  familyById,
  childrenForFamily,
  softPartnerBlockPairs = [],
  widthFor,
}) => {
  const memberOffsets = new Map();
  blocks.forEach((block) => {
    let cursor = -block.width / 2;
    block.members.forEach((personId, index) => {
      const width = widthFor(personId);
      memberOffsets.set(personId, cursor + width / 2);
      cursor += width + (block.memberGaps[index] || 0);
    });
  });

  const union = makeUnionFind(blocks.map((block) => block.id));
  const adjacency = new Map(blocks.map((block) => [block.id, []]));
  const anchoredChildByParentBlock = new Map();
  const addConstraint = (fromId, toId, delta) => {
    if (!fromId || !toId || fromId === toId || union.find(fromId) === union.find(toId)) return;
    union.union(fromId, toId);
    adjacency.get(fromId).push({ id: toId, delta });
    adjacency.get(toId).push({ id: fromId, delta: -delta });
  };

  [...familyById.values()]
    .filter((family) => family.kind === 'family' && family.partners.length && family.children.length)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .forEach((family) => {
      const layoutChildren = childrenForFamily(family);
      const childBlockIds = [...new Set(layoutChildren
        .map((personId) => blockIdByPerson.get(personId))
        .filter(Boolean))];
      if (childBlockIds.length !== 1) return;

      const childBlockId = childBlockIds[0];
      const parentBlockIds = [...new Set(family.partners
        .map((personId) => blockIdByPerson.get(personId))
        .filter(Boolean))];
      if (!parentBlockIds.length) return;

      const baseParentBlockId = parentBlockIds[0];
      const anchoredChildBlockId = anchoredChildByParentBlock.get(baseParentBlockId);
      if (anchoredChildBlockId && anchoredChildBlockId !== childBlockId) return;
      anchoredChildByParentBlock.set(baseParentBlockId, childBlockId);
      const baseCenter = blockCenters.get(baseParentBlockId) || 0;

      parentBlockIds.slice(1).forEach((parentBlockId) => {
        addConstraint(
          baseParentBlockId,
          parentBlockId,
          (blockCenters.get(parentBlockId) || 0) - baseCenter,
        );
      });
      const parentFamilyOffset = family.partners.reduce((sum, parentId) => {
        const parentBlockId = blockIdByPerson.get(parentId);
        return sum + (blockCenters.get(parentBlockId) || 0) - baseCenter + (memberOffsets.get(parentId) || 0);
      }, 0) / family.partners.length;
      const childGroupOffset = layoutChildren.reduce(
        (sum, childId) => sum + (memberOffsets.get(childId) || 0),
        0,
      ) / layoutChildren.length;
      addConstraint(
        baseParentBlockId,
        childBlockId,
        parentFamilyOffset - childGroupOffset,
      );
    });

  softPartnerBlockPairs.forEach(({ leftBlockId, rightBlockId }) => {
    addConstraint(
      leftBlockId,
      rightBlockId,
      (blockCenters.get(rightBlockId) || 0) - (blockCenters.get(leftBlockId) || 0),
    );
  });

  const visited = new Set();
  const clusters = [];
  blocks.forEach((block) => {
    if (visited.has(block.id)) return;
    const relativeCenters = new Map([[block.id, 0]]);
    const queue = [block.id];
    const members = [];
    while (queue.length) {
      const blockId = queue.shift();
      if (visited.has(blockId)) continue;
      visited.add(blockId);
      members.push(blockById.get(blockId));
      (adjacency.get(blockId) || []).forEach((edge) => {
        if (relativeCenters.has(edge.id)) return;
        relativeCenters.set(edge.id, relativeCenters.get(blockId) + edge.delta);
        queue.push(edge.id);
      });
    }
    const initialOrigin = members.reduce(
      (sum, item) => sum + (blockCenters.get(item.id) || 0) - relativeCenters.get(item.id),
      0,
    ) / members.length;
    const rows = new Map();
    members.forEach((item) => {
      const center = relativeCenters.get(item.id);
      const row = rows.get(item.generation) || { left: Infinity, right: -Infinity };
      row.left = Math.min(row.left, center - item.width / 2);
      row.right = Math.max(row.right, center + item.width / 2);
      rows.set(item.generation, row);
    });
    clusters.push({
      members,
      componentId: members[0]?.componentId,
      relativeCenters,
      rows,
      initialOrigin,
      familyLayoutOrder: (() => {
        const order = members.reduce((minimum, item) =>
          Number.isInteger(item.familyLayoutOrder)
            ? Math.min(minimum, item.familyLayoutOrder)
            : minimum, Number.MAX_SAFE_INTEGER);
        return order === Number.MAX_SAFE_INTEGER ? null : order;
      })(),
      order: Math.min(...members.map((item) => item.order)),
      initialLeft: Math.min(...members.map(
        (item) => initialOrigin + relativeCenters.get(item.id) - item.width / 2,
      )),
    });
  });

  const rowRight = new Map();
  clusters
    .sort((a, b) => {
      const hasExplicitOrder = Number.isInteger(a.familyLayoutOrder) || Number.isInteger(b.familyLayoutOrder);
      const orderA = Number.isInteger(a.familyLayoutOrder) ? a.familyLayoutOrder : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isInteger(b.familyLayoutOrder) ? b.familyLayoutOrder : Number.MAX_SAFE_INTEGER;
      if (hasExplicitOrder && orderA !== orderB) {
        return orderA - orderB;
      }
      return a.initialLeft - b.initialLeft || a.order - b.order;
    })
    .forEach((cluster) => {
      let origin = cluster.initialOrigin;
      cluster.rows.forEach((row, generation) => {
        const occupiedRight = rowRight.get(generation);
        if (Number.isFinite(occupiedRight)) {
          origin = Math.max(origin, occupiedRight + FAMILY_GAP - row.left);
        }
      });
      cluster.members.forEach((item) => {
        blockCenters.set(item.id, origin + cluster.relativeCenters.get(item.id));
      });
      cluster.origin = origin;
      cluster.rows.forEach((row, generation) => {
        rowRight.set(generation, Math.max(rowRight.get(generation) ?? -Infinity, origin + row.right));
      });
    });

  const manualClustersByComponent = new Map();
  clusters.forEach((cluster) => {
    if (!Number.isInteger(cluster.familyLayoutOrder)) return;
    manualClustersByComponent.set(cluster.componentId, [
      ...(manualClustersByComponent.get(cluster.componentId) || []),
      cluster,
    ]);
  });
  manualClustersByComponent.forEach((componentClusters) => {
    if (componentClusters.length < 2) return;
    componentClusters.sort((a, b) =>
      a.familyLayoutOrder - b.familyLayoutOrder || a.initialLeft - b.initialLeft || a.order - b.order);
    const packedOrigins = [0];
    componentClusters.slice(1).forEach((cluster, index) => {
      const previous = componentClusters[index];
      const sharedGenerations = [...previous.rows.keys()]
        .filter((generation) => cluster.rows.has(generation));
      const minimumDistance = Math.max(...sharedGenerations.map((generation) =>
        previous.rows.get(generation).right + FAMILY_GAP - cluster.rows.get(generation).left));
      packedOrigins.push(packedOrigins[index] + minimumDistance);
    });
    const shift = componentClusters.reduce(
      (sum, cluster, index) => sum + cluster.origin - packedOrigins[index],
      0,
    ) / componentClusters.length;
    componentClusters.forEach((cluster, index) => {
      const origin = packedOrigins[index] + shift;
      cluster.members.forEach((item) => {
        blockCenters.set(item.id, origin + cluster.relativeCenters.get(item.id));
      });
    });
  });
};

export function packIslands(positions, islands, gap = ISLAND_GAP) {
  let cursor = 0;

  return islands.map(({ id, personIds }) => {
    const islandPositions = personIds.map((personId) => positions.get(personId)).filter(Boolean);
    if (!islandPositions.length) {
      return { id, personIds, left: cursor, right: cursor, width: 0, offsetX: 0 };
    }

    const left = Math.min(...islandPositions.map((position) => position.x));
    const right = Math.max(...islandPositions.map((position) => position.x + position.width));
    const width = right - left;
    const offsetX = cursor - left;
    personIds.forEach((personId) => {
      const position = positions.get(personId);
      if (position) positions.set(personId, { ...position, x: position.x + offsetX });
    });

    const packed = { id, personIds, left: cursor, right: cursor + width, width, offsetX };
    cursor = packed.right + gap;
    return packed;
  });
}

export function assignGenerations({
  blockMembers,
  parentBlocksByChildBlock,
  childBlocksByParentBlock,
  sameGenerationBlocks,
  personOrder,
}) {
  const blockOrder = new Map([...blockMembers].map(([blockId, members]) => [
    blockId,
    Math.min(...members.map((id) => personOrder.get(id) ?? Number.MAX_SAFE_INTEGER)),
  ]));
  const adjacency = new Map([...blockMembers.keys()].map((id) => [id, new Set()]));
  childBlocksByParentBlock.forEach((children, parentId) => children.forEach((childId) => {
    adjacency.get(parentId)?.add(childId);
    adjacency.get(childId)?.add(parentId);
  }));
  sameGenerationBlocks.forEach((neighbors, blockId) => neighbors.forEach((neighborId) => {
    adjacency.get(blockId)?.add(neighborId);
    adjacency.get(neighborId)?.add(blockId);
  }));
  const byOrder = (a, b) => (blockOrder.get(a) ?? 0) - (blockOrder.get(b) ?? 0);
  const remaining = new Set(blockMembers.keys());
  const generation = new Map();
  const componentAnchors = [];
  const componentByBlock = new Map();

  while (remaining.size) {
    const anchor = [...remaining].sort(byOrder)[0];
    componentAnchors.push(anchor);
    const component = new Set();
    const collect = [anchor];
    while (collect.length) {
      const blockId = collect.shift();
      if (component.has(blockId)) continue;
      component.add(blockId);
      componentByBlock.set(blockId, anchor);
      remaining.delete(blockId);
      collect.push(...[...(adjacency.get(blockId) || [])].sort(byOrder));
    }

    generation.set(anchor, 0);
    const queue = [anchor];
    while (queue.length) {
      const blockId = queue.shift();
      const rank = generation.get(blockId);
      const nextBlocks = [
        ...[...(sameGenerationBlocks.get(blockId) || [])]
          .sort(byOrder).map((id) => ({ id, rank })),
        ...[...(parentBlocksByChildBlock.get(blockId) || [])]
          .sort(byOrder).map((id) => ({ id, rank: rank - 1 })),
        ...[...(childBlocksByParentBlock.get(blockId) || [])]
          .sort(byOrder).map((id) => ({ id, rank: rank + 1 })),
      ];
      nextBlocks.forEach((next) => {
        if (!component.has(next.id) || generation.has(next.id)) return;
        generation.set(next.id, next.rank);
        queue.push(next.id);
      });
    }
  }

  return { generation, componentAnchors, componentByBlock };
}

export function calculateLayout(people, relationships) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const fallbackOrder = new Map(people.map((person, index) => [person.id, index]));
  const personOrder = new Map([...people]
    .sort((a, b) => comparePersonDisplayOrder(a, b, fallbackOrder))
    .map((person, index) => [person.id, index]));
  const widthFor = () => TREE_CARD_WIDTH;
  const { familyUnits, parentFamilyByPerson, partnerFamilyIdsByPerson } = buildFamilyUnits(
    people,
    relationships,
  );
  const structuralFamilies = familyUnits.filter((family) => family.kind === 'family');
  const familyById = new Map(familyUnits.map((family) => [family.id, family]));
  const childrenForFamily = (family) => family.children;
  const relationshipTypeByPair = new Map();
  relationships.forEach((relationship) => {
    if (!['spouse', 'partner', 'divorced', 'sibling'].includes(relationship.type)) return;
    relationshipTypeByPair.set(
      [relationship.personAId, relationship.personBId].sort().join('|'),
      relationship.type,
    );
  });

  // Native sibling groups are physical blocks. Partner relationships only
  // constrain generation and never move a person out of their own group.
  const unionFind = makeUnionFind(people.map((person) => person.id));
  relationships.forEach((relationship) => {
    if (
      relationship.type === 'sibling' &&
      peopleById.has(relationship.personAId) &&
      peopleById.has(relationship.personBId)
    ) {
      unionFind.union(relationship.personAId, relationship.personBId);
    }
  });
  structuralFamilies.forEach((family) => {
    family.children.slice(1).forEach((childId) => unionFind.union(family.children[0], childId));
  });

  const blockMembers = new Map();
  people.forEach((person) => {
    const root = unionFind.find(person.id);
    blockMembers.set(root, [...(blockMembers.get(root) || []), person.id]);
  });
  const blockIdByPerson = new Map();
  blockMembers.forEach((members, blockId) => members.forEach((id) => blockIdByPerson.set(id, blockId)));

  const sameGenerationBlocks = new Map([...blockMembers.keys()].map((id) => [id, new Set()]));
  relationships.forEach((relationship) => {
    if (!PARTNER_TYPES.has(relationship.type)) return;
    const blockA = blockIdByPerson.get(relationship.personAId);
    const blockB = blockIdByPerson.get(relationship.personBId);
    if (!blockA || !blockB || blockA === blockB) return;
    sameGenerationBlocks.get(blockA).add(blockB);
    sameGenerationBlocks.get(blockB).add(blockA);
  });

  const parentBlocksByChildBlock = new Map();
  const childBlocksByParentBlock = new Map();
  structuralFamilies.forEach((family) => {
    family.children.forEach((childId) => {
      const childBlock = blockIdByPerson.get(childId);
      family.partners.forEach((parentId) => {
        const parentBlock = blockIdByPerson.get(parentId);
        if (!parentBlock || !childBlock || parentBlock === childBlock) return;
        parentBlocksByChildBlock.set(childBlock, new Set([
          ...(parentBlocksByChildBlock.get(childBlock) || []),
          parentBlock,
        ]));
        childBlocksByParentBlock.set(parentBlock, new Set([
          ...(childBlocksByParentBlock.get(parentBlock) || []),
          childBlock,
        ]));
      });
    });
  });

  const { generation, componentAnchors, componentByBlock } = assignGenerations({
    blockMembers,
    parentBlocksByChildBlock,
    childBlocksByParentBlock,
    sameGenerationBlocks,
    personOrder,
  });

  const blocks = [...blockMembers.entries()].map(([id, members]) => {
    const stableMembers = [...members].sort(
      (a, b) => {
        const parentOrderA = familyById.get(parentFamilyByPerson.get(a))?.displayOrder;
        const parentOrderB = familyById.get(parentFamilyByPerson.get(b))?.displayOrder;
        if (Number.isFinite(parentOrderA) && Number.isFinite(parentOrderB) && parentOrderA !== parentOrderB) {
          return parentOrderA - parentOrderB;
        }
        return (personOrder.get(a) ?? 0) - (personOrder.get(b) ?? 0);
      },
    );
    const orderedMembers = orderByFamilies(stableMembers, familyUnits);
    const memberGaps = orderedMembers.slice(1).map((personId, index) => {
      const previousId = orderedMembers[index];
      const relationshipType = relationshipTypeByPair.get([previousId, personId].sort().join('|'));
      const sharedParentFamily = parentFamilyByPerson.get(previousId) &&
        parentFamilyByPerson.get(previousId) === parentFamilyByPerson.get(personId);
      return relationshipType === 'sibling' || sharedParentFamily ? SIBLING_GAP : PARTNER_GAP;
    });
    return {
      id,
      members: orderedMembers,
      memberGaps,
      generation: generation.get(id) || 0,
      componentId: componentByBlock.get(id),
      width: orderedMembers.reduce((sum, personId) => sum + widthFor(personId), 0) +
        memberGaps.reduce((sum, gap) => sum + gap, 0),
      familyLayoutOrder: (() => {
        const order = orderedMembers.reduce((minimum, personId) => {
        const explicitOrder = peopleById.get(personId)?.familyLayoutOrder;
          return Number.isInteger(explicitOrder) ? Math.min(minimum, explicitOrder) : minimum;
        }, Number.MAX_SAFE_INTEGER);
        return order === Number.MAX_SAFE_INTEGER ? null : order;
      })(),
      order: Math.min(...orderedMembers.map((personId) => personOrder.get(personId) ?? 0)),
    };
  });
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const rowsByComponent = new Map();
  blocks.forEach((block) => {
    const rows = rowsByComponent.get(block.componentId) || new Map();
    rows.set(block.generation, [...(rows.get(block.generation) || []), block]);
    rowsByComponent.set(block.componentId, rows);
  });

  const neighborBlocks = (block, direction) => {
    const source = direction === 'parents' ? parentBlocksByChildBlock : childBlocksByParentBlock;
    return [...(source.get(block.id) || [])].map((id) => blockById.get(id)).filter(Boolean);
  };
  rowsByComponent.forEach((rows) => {
    const generations = [...rows.keys()].sort((a, b) => a - b);
    for (let sweep = 0; sweep < 4; sweep += 1) {
      for (const rank of generations) {
        const row = rows.get(rank) || [];
        row.sort((a, b) => {
          const neighborsA = neighborBlocks(a, 'parents');
          const neighborsB = neighborBlocks(b, 'parents');
          const baryA = neighborsA.length ? neighborsA.reduce((sum, item) => sum + item.order, 0) / neighborsA.length : a.order;
          const baryB = neighborsB.length ? neighborsB.reduce((sum, item) => sum + item.order, 0) / neighborsB.length : b.order;
          if (neighborsA.length && neighborsB.length && baryA !== baryB) return baryA - baryB;
          return a.order - b.order;
        });
      }
    }
  });

  const familyLayoutRows = [...rowsByComponent.entries()].flatMap(([componentId, rows]) =>
    [...rows.entries()].map(([rowGeneration, row]) => ({
      componentId,
      generation: rowGeneration,
      groups: orderFamilyRowGroups(
        groupFamilyRow(row, familyUnits, blockIdByPerson, SIBLING_GAP),
        peopleById,
        parentFamilyByPerson,
        familyById,
      ),
    })));
  const rowGroups = familyLayoutRows.map(({ groups }) => groups);
  const familyWidth = (family) => {
    const parentBlockIds = [...new Set(family.partners
      .map((personId) => blockIdByPerson.get(personId))
      .filter(Boolean))];
    if (!parentBlockIds.length) return 0;
    const partnerGap = family.partners.length === 2 && PARTNER_TYPES.has(
      relationshipTypeByPair.get(keyForPair(family.partners[0], family.partners[1])),
    ) ? PARTNER_GAP : FAMILY_GAP;
    return parentBlockIds.reduce(
      (sum, blockId) => sum + (blockById.get(blockId)?.width || 0),
      0,
    ) + Math.max(0, parentBlockIds.length - 1) * partnerGap;
  };
  const boundaryPerson = (group, side) => {
    const member = side === 'left' ? group.members[0] : group.members[group.members.length - 1];
    if (!member) return undefined;
    return side === 'left' ? member.block.members[0] : member.block.members[member.block.members.length - 1];
  };
  const gapBetweenGroups = (leftGroup, rightGroup) => {
    const leftPersonId = boundaryPerson(leftGroup, 'right');
    const rightPersonId = boundaryPerson(rightGroup, 'left');
    const relationshipType = relationshipTypeByPair.get(keyForPair(leftPersonId, rightPersonId));
    const baseGap = PARTNER_TYPES.has(relationshipType) ? PARTNER_GAP : FAMILY_GAP;
    if (PARTNER_TYPES.has(relationshipType)) return baseGap;
    const leftFamily = familyById.get(parentFamilyByPerson.get(leftPersonId));
    const rightFamily = familyById.get(parentFamilyByPerson.get(rightPersonId));
    if (!leftFamily || !rightFamily || leftFamily.id === rightFamily.id) return baseGap;
    const requiredCenterDistance = familyWidth(leftFamily) / 2 + FAMILY_GAP + familyWidth(rightFamily) / 2;
    return Math.max(baseGap, requiredCenterDistance - leftGroup.width / 2 - rightGroup.width / 2);
  };
  const blockCenters = new Map();
  const softPartnerBlockPairs = [];
  rowGroups.forEach((groups) => {
    let cursor = 0;
    groups.forEach((group, index) => {
      group.members.forEach(({ block, offset }) => blockCenters.set(block.id, cursor + group.width / 2 + offset));
      const nextGroup = groups[index + 1];
      if (nextGroup && gapBetweenGroups(group, nextGroup) === PARTNER_GAP) {
        softPartnerBlockPairs.push({
          leftBlockId: group.members[group.members.length - 1].block.id,
          rightBlockId: nextGroup.members[0].block.id,
          leftPersonId: boundaryPerson(group, 'right'),
          rightPersonId: boundaryPerson(nextGroup, 'left'),
        });
      }
      cursor += group.width;
      if (nextGroup) cursor += gapBetweenGroups(group, nextGroup);
    });
  });

  const memberCenter = (personId) => {
    const block = blockById.get(blockIdByPerson.get(personId));
    if (!block) return 0;
    let cursor = (blockCenters.get(block.id) || 0) - block.width / 2;
    for (let index = 0; index < block.members.length; index += 1) {
      const memberId = block.members[index];
      const memberWidth = widthFor(memberId);
      if (memberId === personId) return cursor + memberWidth / 2;
      cursor += memberWidth + (block.memberGaps[index] || 0);
    }
    return blockCenters.get(block.id) || 0;
  };

  for (let pass = 0; pass < 8; pass += 1) {
    const desired = new Map();
    blocks.forEach((block) => {
      const targets = [];
      structuralFamilies.forEach((family) => {
        const partnerBlocks = new Set(family.partners.map((id) => blockIdByPerson.get(id)));
        if (partnerBlocks.has(block.id) && family.children.length) {
          targets.push(...childrenForFamily(family).map(memberCenter));
        }
        if (family.children.some((id) => blockIdByPerson.get(id) === block.id) && family.partners.length) {
          targets.push(family.partners.map(memberCenter).reduce((sum, x) => sum + x, 0) / family.partners.length);
        }
      });
      desired.set(
        block.id,
        targets.length ? targets.reduce((sum, value) => sum + value, 0) / targets.length : blockCenters.get(block.id),
      );
    });
    rowGroups.forEach((groups) => {
      const desiredGroups = new Map(groups.map((group) => [group.id,
        group.members.reduce((sum, { block, offset }) => sum + desired.get(block.id) - offset, 0) / group.members.length,
      ]));
      const centers = compactRow(groups, desiredGroups, gapBetweenGroups);
      groups.forEach((group) => group.members.forEach(({ block, offset }) =>
        blockCenters.set(block.id, centers.get(group.id) + offset)));
    });
  }

  enforceStrictParentAnchors({
    blocks,
    blockById,
    blockIdByPerson,
    blockCenters,
    familyById,
    childrenForFamily: (family) => family.children,
    softPartnerBlockPairs,
    widthFor,
  });

  // A naturally adjacent marriage remains compact even when both people have
  // ancestry anchors of their own. Move both native blocks symmetrically so
  // their shared descendant anchor stays stable.
  softPartnerBlockPairs.forEach((pair) => {
    const leftCenter = memberCenter(pair.leftPersonId);
    const rightCenter = memberCenter(pair.rightPersonId);
    const desiredDistance = widthFor(pair.leftPersonId) / 2 + PARTNER_GAP +
      widthFor(pair.rightPersonId) / 2;
    const excess = rightCenter - leftCenter - desiredDistance;
    if (excess <= 0) return;
    blockCenters.set(pair.leftBlockId, (blockCenters.get(pair.leftBlockId) || 0) + excess / 2);
    blockCenters.set(pair.rightBlockId, (blockCenters.get(pair.rightBlockId) || 0) - excess / 2);
  });

  // When both compact partners have parent families, those wider ancestry
  // blocks cannot both remain centered without overlapping. Keep each
  // adjacent couple together and resolve the unavoidable conflict between
  // whole couple clusters on that row.
  const partnerClusterUnion = makeUnionFind(blocks.map((block) => block.id));
  softPartnerBlockPairs.forEach(({ leftBlockId, rightBlockId }) =>
    partnerClusterUnion.union(leftBlockId, rightBlockId));
  const partnerClustersByRow = new Map();
  blocks.forEach((block) => {
    const row = partnerClustersByRow.get(block.generation) || new Map();
    const root = partnerClusterUnion.find(block.id);
    row.set(root, [...(row.get(root) || []), block]);
    partnerClustersByRow.set(block.generation, row);
  });
  partnerClustersByRow.forEach((row) => {
    const clusters = [...row.entries()].map(([id, members]) => {
      const left = Math.min(...members.map(
        (block) => (blockCenters.get(block.id) || 0) - block.width / 2,
      ));
      const right = Math.max(...members.map(
        (block) => (blockCenters.get(block.id) || 0) + block.width / 2,
      ));
      return {
        id,
        members,
        center: (left + right) / 2,
        width: right - left,
        familyLayoutOrder: (() => {
          const order = members.reduce((minimum, block) =>
            Number.isInteger(block.familyLayoutOrder)
              ? Math.min(minimum, block.familyLayoutOrder)
              : minimum, Number.MAX_SAFE_INTEGER);
          return order === Number.MAX_SAFE_INTEGER ? null : order;
        })(),
      };
    }).sort((a, b) => {
      const hasExplicitOrder = Number.isInteger(a.familyLayoutOrder) || Number.isInteger(b.familyLayoutOrder);
      const orderA = Number.isInteger(a.familyLayoutOrder) ? a.familyLayoutOrder : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isInteger(b.familyLayoutOrder) ? b.familyLayoutOrder : Number.MAX_SAFE_INTEGER;
      if (hasExplicitOrder && orderA !== orderB) {
        return orderA - orderB;
      }
      return a.center - b.center;
    });
    const desiredCenters = new Map(clusters.map((cluster) => [cluster.id, cluster.center]));
    const packedCenters = compactRow(clusters, desiredCenters);
    clusters.forEach((cluster) => {
      const delta = packedCenters.get(cluster.id) - cluster.center;
      cluster.members.forEach((block) =>
        blockCenters.set(block.id, (blockCenters.get(block.id) || 0) + delta));
    });
  });

  const positions = new Map();
  blocks.forEach((block) => {
    let cursor = (blockCenters.get(block.id) || 0) - block.width / 2;
    block.members.forEach((personId, index) => {
      const cardWidth = widthFor(personId);
      positions.set(personId, {
        x: cursor,
        y: PAD_Y + block.generation * (TREE_CARD_HEIGHT + GENERATION_GAP),
        width: cardWidth,
        height: TREE_CARD_HEIGHT,
      });
      cursor += cardWidth + (block.memberGaps[index] || 0);
    });
  });

  const islandBounds = packIslands(
    positions,
    componentAnchors.map((componentId) => ({
      id: componentId,
      personIds: blocks
        .filter((block) => block.componentId === componentId)
        .flatMap((block) => block.members),
    })),
  );

  const minX = Math.min(0, ...[...positions.values()].map((position) => position.x));
  const shiftX = PAD_X - minX;
  positions.forEach((position, id) => positions.set(id, { ...position, x: position.x + shiftX }));
  const shiftedIslandBounds = islandBounds.map((island) => ({
    ...island,
    left: island.left + shiftX,
    right: island.right + shiftX,
  }));
  const right = Math.max(...[...positions.values()].map((position) => position.x + position.width));
  const top = Math.min(0, ...[...positions.values()].map((position) => position.y)) - PAD_Y;
  const bottom = Math.max(520, ...[...positions.values()].map((position) => position.y + position.height)) + PAD_Y;
  const personGenerations = new Map(people.map((person) => [
    person.id,
    generation.get(blockIdByPerson.get(person.id)) || 0,
  ]));

  return {
    people,
    positions,
    familyUnits,
    parentFamilyByPerson,
    partnerFamilyIdsByPerson,
    generations: personGenerations,
    componentAnchors: componentAnchors.map((blockId) => blockMembers.get(blockId)[0]),
    islandBounds: shiftedIslandBounds,
    familyLayoutRows: familyLayoutRows.map(({ componentId, generation: rowGeneration, groups }) => ({
      componentId,
      generation: rowGeneration,
      groups: groups.map((group) => ({
        id: group.id,
        personIds: getFamilyRowGroupPersonIds(group),
      })),
    })),
    width: right + PAD_X,
    height: bottom,
    bounds: { left: 0, top, width: right + PAD_X, height: bottom - top },
  };
}

export const buildFamilyTreeLayout = calculateLayout;

export function getChildConnectionGeometry(connection, positions) {
  const parents = connection.parentIds.map((id) => positions.get(id)).filter(Boolean);
  const children = connection.childrenIds.map((id) => positions.get(id)).filter(Boolean);
  if (!parents.length || !children.length) return null;
  const parentCenters = parents.map(cardCenter);
  const childCenters = children.map(cardCenter);
  const sourceX = parentCenters.reduce((sum, point) => sum + point.x, 0) / parentCenters.length;
  const sourceY = parents.length > 1
    ? parentCenters.reduce((sum, point) => sum + point.y, 0) / parentCenters.length
    : parents[0].y + parents[0].height;
  const childTop = Math.min(...children.map((position) => position.y));
  return {
    sourceX,
    sourceY,
    branchY: sourceY + (childTop - sourceY) / 2,
    childPositions: children,
    childCenters,
  };
}

export const getChildConnectionPath = (geometry, childPosition) => {
  const child = cardCenter(childPosition);
  return `M ${geometry.sourceX} ${geometry.sourceY} V ${geometry.branchY} H ${child.x} V ${childPosition.y}`;
};

export const relationshipPairKey = keyForPair;
