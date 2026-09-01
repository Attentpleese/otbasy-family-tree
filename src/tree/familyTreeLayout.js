import { buildFamilyUnits } from './familyUnits';
import { groupFamilyRow, orderByFamilies } from './familyRowGroups';
import { comparePersonDisplayOrder } from '../domain/familyGraph';

export const TREE_CARD_WIDTH = 232;
export const TREE_CARD_MIN_WIDTH = 212;
export const TREE_CARD_MAX_WIDTH = 340;
export const TREE_CARD_HEIGHT = 112;

export const SIBLING_GAP = 40;
export const PARTNER_GAP = 24;
export const FAMILY_GAP = 40;
export const GENERATION_GAP = 124;
const PAD_X = 72;
const PAD_Y = 56;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const keyForPair = (a, b) => [a, b].sort().join('|');

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

const compactRow = (blocks, desiredCenters) => {
  if (!blocks.length) return new Map();
  const centers = blocks.map((block) => desiredCenters.get(block.id) ?? block.center ?? 0);
  for (let index = 1; index < blocks.length; index += 1) {
    const minimum = centers[index - 1] + blocks[index - 1].width / 2 + FAMILY_GAP + blocks[index].width / 2;
    centers[index] = Math.max(centers[index], minimum);
  }
  for (let index = blocks.length - 2; index >= 0; index -= 1) {
    const maximum = centers[index + 1] - blocks[index + 1].width / 2 - FAMILY_GAP - blocks[index].width / 2;
    centers[index] = Math.min(centers[index], maximum);
  }
  const shift = blocks.reduce(
    (sum, block, index) => sum + (desiredCenters.get(block.id) ?? centers[index]) - centers[index],
    0,
  ) / blocks.length;
  return new Map(blocks.map((block, index) => [block.id, centers[index] + shift]));
};

export function calculateLayout(people, relationships, options = {}) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const fallbackOrder = new Map(people.map((person, index) => [person.id, index]));
  const personOrder = new Map([...people]
    .sort((a, b) => comparePersonDisplayOrder(a, b, fallbackOrder))
    .map((person, index) => [person.id, index]));
  const nodeWidths = options.nodeWidths instanceof Map
    ? options.nodeWidths
    : new Map(Object.entries(options.nodeWidths || {}));
  const widthFor = (id) => clamp(
    Number(nodeWidths.get(id)) || TREE_CARD_WIDTH,
    TREE_CARD_MIN_WIDTH,
    TREE_CARD_MAX_WIDTH,
  );
  const { familyUnits, parentFamilyByPerson, partnerFamilyIdsByPerson } = buildFamilyUnits(
    people,
    relationships,
  );
  const structuralFamilies = familyUnits.filter((family) => family.kind === 'family');
  const relationshipTypeByPair = new Map();
  relationships.forEach((relationship) => {
    if (!['spouse', 'partner', 'divorced', 'sibling'].includes(relationship.type)) return;
    relationshipTypeByPair.set(
      [relationship.personAId, relationship.personBId].sort().join('|'),
      relationship.type,
    );
  });

  // Spouses and explicit siblings are one movable, same-generation block.
  const unionFind = makeUnionFind(people.map((person) => person.id));
  relationships.forEach((relationship) => {
    if (
      ['spouse', 'partner', 'divorced', 'sibling'].includes(relationship.type) &&
      peopleById.has(relationship.personAId) &&
      peopleById.has(relationship.personBId)
    ) {
      unionFind.union(relationship.personAId, relationship.personBId);
    }
  });

  const blockMembers = new Map();
  people.forEach((person) => {
    const root = unionFind.find(person.id);
    blockMembers.set(root, [...(blockMembers.get(root) || []), person.id]);
  });
  const blockIdByPerson = new Map();
  blockMembers.forEach((members, blockId) => members.forEach((id) => blockIdByPerson.set(id, blockId)));

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

  const generation = new Map([...blockMembers.keys()].map((id) => [id, 0]));
  for (let pass = 0; pass < blockMembers.size; pass += 1) {
    let changed = false;
    childBlocksByParentBlock.forEach((children, parentBlock) => {
      children.forEach((childBlock) => {
        const next = Math.max(generation.get(childBlock) || 0, (generation.get(parentBlock) || 0) + 1);
        if (next !== generation.get(childBlock)) {
          generation.set(childBlock, next);
          changed = true;
        }
      });
    });
    familyUnits.forEach((family) => {
      const childBlocks = family.children.map((id) => blockIdByPerson.get(id));
      const rank = Math.max(0, ...childBlocks.map((id) => generation.get(id) || 0));
      childBlocks.forEach((id) => {
        if (generation.get(id) !== rank) {
          generation.set(id, rank);
          changed = true;
        }
      });
    });
    if (!changed) break;
  }

  const blocks = [...blockMembers.entries()].map(([id, members]) => {
    const stableMembers = [...members].sort(
      (a, b) => (personOrder.get(a) ?? 0) - (personOrder.get(b) ?? 0),
    );
    const orderedMembers = orderByFamilies(stableMembers, familyUnits);
    const memberGaps = orderedMembers.slice(1).map((personId, index) => {
      const previousId = orderedMembers[index];
      const relationshipType = relationshipTypeByPair.get([previousId, personId].sort().join('|'));
      return relationshipType === 'sibling' ? SIBLING_GAP : PARTNER_GAP;
    });
    return {
      id,
      members: orderedMembers,
      memberGaps,
      generation: generation.get(id) || 0,
      width: orderedMembers.reduce((sum, personId) => sum + widthFor(personId), 0) +
        memberGaps.reduce((sum, gap) => sum + gap, 0),
      order: Math.min(...orderedMembers.map((personId) => personOrder.get(personId) ?? 0)),
    };
  });
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const rows = new Map();
  blocks.forEach((block) => rows.set(block.generation, [...(rows.get(block.generation) || []), block]));

  const neighborBlocks = (block, direction) => {
    const source = direction === 'parents' ? parentBlocksByChildBlock : childBlocksByParentBlock;
    return [...(source.get(block.id) || [])].map((id) => blockById.get(id)).filter(Boolean);
  };
  const maxGeneration = Math.max(0, ...rows.keys());
  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (let rank = 0; rank <= maxGeneration; rank += 1) {
      const row = rows.get(rank) || [];
      row.sort((a, b) => {
        const neighborsA = neighborBlocks(a, sweep % 2 ? 'children' : 'parents');
        const neighborsB = neighborBlocks(b, sweep % 2 ? 'children' : 'parents');
        const baryA = neighborsA.length ? neighborsA.reduce((sum, item) => sum + item.order, 0) / neighborsA.length : a.order;
        const baryB = neighborsB.length ? neighborsB.reduce((sum, item) => sum + item.order, 0) / neighborsB.length : b.order;
        return a.order - b.order || baryA - baryB;
      });
    }
  }

  const rowGroups = [...rows.values()].map((row) => groupFamilyRow(row, familyUnits, blockIdByPerson, SIBLING_GAP));
  const blockCenters = new Map();
  rowGroups.forEach((groups) => {
    let cursor = 0;
    groups.forEach((group) => {
      group.members.forEach(({ block, offset }) => blockCenters.set(block.id, cursor + group.width / 2 + offset));
      cursor += group.width + FAMILY_GAP;
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
          targets.push(...family.children.map(memberCenter));
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
      const centers = compactRow(groups, desiredGroups);
      groups.forEach((group) => group.members.forEach(({ block, offset }) =>
        blockCenters.set(block.id, centers.get(group.id) + offset)));
    });
  }

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

  const minX = Math.min(0, ...[...positions.values()].map((position) => position.x));
  const shiftX = PAD_X - minX;
  positions.forEach((position, id) => positions.set(id, { ...position, x: position.x + shiftX }));
  const right = Math.max(760, ...[...positions.values()].map((position) => position.x + position.width));

  return {
    people,
    positions,
    familyUnits,
    parentFamilyByPerson,
    partnerFamilyIdsByPerson,
    width: right + PAD_X,
    height: Math.max(520, PAD_Y * 2 + (maxGeneration + 1) * TREE_CARD_HEIGHT + maxGeneration * GENERATION_GAP),
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
