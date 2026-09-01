import { buildFamilyUnits } from './familyUnits';

export const TREE_CARD_WIDTH = 232;
export const TREE_CARD_MIN_WIDTH = 212;
export const TREE_CARD_MAX_WIDTH = 340;
export const TREE_CARD_HEIGHT = 112;

const MEMBER_GAP = 32;
const BLOCK_GAP = 72;
const ROW_GAP = 96;
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
    const minimum = centers[index - 1] + blocks[index - 1].width / 2 + BLOCK_GAP + blocks[index].width / 2;
    centers[index] = Math.max(centers[index], minimum);
  }
  for (let index = blocks.length - 2; index >= 0; index -= 1) {
    const maximum = centers[index + 1] - blocks[index + 1].width / 2 - BLOCK_GAP - blocks[index].width / 2;
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
  const personOrder = new Map(people.map((person, index) => [person.id, index]));
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
  const familyById = new Map(familyUnits.map((family) => [family.id, family]));

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
  familyUnits.filter((family) => family.kind === 'family').forEach((family) => {
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
    if (!changed) break;
  }

  const ancestorSpanMemo = new Map();
  const ancestorSpan = (personId, trail = new Set()) => {
    if (ancestorSpanMemo.has(personId)) return ancestorSpanMemo.get(personId);
    if (trail.has(personId)) return widthFor(personId);
    const family = familyById.get(parentFamilyByPerson.get(personId));
    if (!family?.partners.length) return widthFor(personId);
    const nextTrail = new Set(trail).add(personId);
    const span = Math.max(
      widthFor(personId),
      family.partners.reduce((sum, id) => sum + ancestorSpan(id, nextTrail), 0) +
        MEMBER_GAP * Math.max(0, family.partners.length - 1),
    );
    ancestorSpanMemo.set(personId, span);
    return span;
  };

  const descendantSpanMemo = new Map();
  const descendantSpan = (personId, trail = new Set()) => {
    if (descendantSpanMemo.has(personId)) return descendantSpanMemo.get(personId);
    if (trail.has(personId)) return widthFor(personId);
    const nextTrail = new Set(trail).add(personId);
    const familySpans = (partnerFamilyIdsByPerson.get(personId) || [])
      .map((familyId) => familyById.get(familyId))
      .filter((family) => family?.children.length)
      .map((family) => family.children.reduce(
        (sum, childId) => sum + descendantSpan(childId, nextTrail),
        0,
      ) + MEMBER_GAP * Math.max(0, family.children.length - 1));
    const span = Math.max(widthFor(personId), ...familySpans);
    descendantSpanMemo.set(personId, span);
    return span;
  };

  const blocks = [...blockMembers.entries()].map(([id, members]) => {
    const orderedMembers = [...members].sort(
      (a, b) => (personOrder.get(a) ?? 0) - (personOrder.get(b) ?? 0),
    );
    const slots = orderedMembers.map((personId) => ({
      personId,
      width: Math.max(widthFor(personId), ancestorSpan(personId), descendantSpan(personId)),
    }));
    return {
      id,
      members: orderedMembers,
      slots,
      generation: generation.get(id) || 0,
      width: slots.reduce((sum, slot) => sum + slot.width, 0) + MEMBER_GAP * Math.max(0, slots.length - 1),
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
        return baryA - baryB || a.order - b.order;
      });
    }
  }

  const blockCenters = new Map();
  rows.forEach((row) => {
    let cursor = 0;
    row.forEach((block) => {
      blockCenters.set(block.id, cursor + block.width / 2);
      cursor += block.width + BLOCK_GAP;
    });
  });

  const memberCenter = (personId) => {
    const block = blockById.get(blockIdByPerson.get(personId));
    if (!block) return 0;
    let cursor = (blockCenters.get(block.id) || 0) - block.width / 2;
    for (const slot of block.slots) {
      if (slot.personId === personId) return cursor + slot.width / 2;
      cursor += slot.width + MEMBER_GAP;
    }
    return blockCenters.get(block.id) || 0;
  };

  for (let pass = 0; pass < 8; pass += 1) {
    const desired = new Map();
    blocks.forEach((block) => {
      const targets = [];
      familyUnits.filter((family) => family.kind === 'family').forEach((family) => {
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
    rows.forEach((row) => {
      compactRow(row, desired).forEach((center, id) => blockCenters.set(id, center));
    });
  }

  const positions = new Map();
  blocks.forEach((block) => {
    let cursor = (blockCenters.get(block.id) || 0) - block.width / 2;
    block.slots.forEach((slot) => {
      const cardWidth = widthFor(slot.personId);
      positions.set(slot.personId, {
        x: cursor + (slot.width - cardWidth) / 2,
        y: PAD_Y + block.generation * (TREE_CARD_HEIGHT + ROW_GAP),
        width: cardWidth,
        height: TREE_CARD_HEIGHT,
      });
      cursor += slot.width + MEMBER_GAP;
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
    height: Math.max(520, PAD_Y * 2 + (maxGeneration + 1) * TREE_CARD_HEIGHT + maxGeneration * ROW_GAP),
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
