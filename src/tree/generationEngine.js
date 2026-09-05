import { comparePersonDisplayOrder } from '../domain/familyGraph';
import { buildFamilyUnits } from './familyUnits';
import { SIBLING_GAP, TREE_CARD_HEIGHT, TREE_CARD_WIDTH } from './treeGeometry';

export const GENERATION_GAP = 124;
export const GENERATION_PADDING_Y = 56;
const GENERATION_PADDING_X = 72;
const PARTNER_TYPES = new Set(['spouse', 'partner', 'divorced']);

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

export const generationToY = (
  generation,
  cardHeight,
  generationGap = GENERATION_GAP,
  paddingY = GENERATION_PADDING_Y,
) => paddingY + generation * (cardHeight + generationGap);

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

export const assignPersonGenerations = ({ people, blockIdByPerson, blockGenerations }) =>
  new Map(people.map((person) => [
    person.id,
    blockGenerations.get(blockIdByPerson.get(person.id)) || 0,
  ]));

export function buildGenerationLayout(people, relationships) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const fallbackOrder = new Map(people.map((person, index) => [person.id, index]));
  const orderedPeople = [...people].sort((a, b) => comparePersonDisplayOrder(a, b, fallbackOrder));
  const personOrder = new Map(orderedPeople.map((person, index) => [person.id, index]));
  const { familyUnits, parentFamilyByPerson, partnerFamilyIdsByPerson } = buildFamilyUnits(
    people,
    relationships,
  );
  const structuralFamilies = familyUnits.filter((family) => family.kind === 'family');
  const unionFind = makeUnionFind(people.map((person) => person.id));

  relationships.forEach((relationship) => {
    if (relationship.type !== 'sibling') return;
    if (!peopleById.has(relationship.personAId) || !peopleById.has(relationship.personBId)) return;
    unionFind.union(relationship.personAId, relationship.personBId);
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

  const { generation, componentAnchors } = assignGenerations({
    blockMembers,
    parentBlocksByChildBlock,
    childBlocksByParentBlock,
    sameGenerationBlocks,
    personOrder,
  });
  const generations = assignPersonGenerations({
    people,
    blockIdByPerson,
    blockGenerations: generation,
  });
  const rowIndexByGeneration = new Map();
  const positions = new Map();
  orderedPeople.forEach((person) => {
    const personGeneration = generations.get(person.id) || 0;
    const rowIndex = rowIndexByGeneration.get(personGeneration) || 0;
    rowIndexByGeneration.set(personGeneration, rowIndex + 1);
    positions.set(person.id, {
      x: GENERATION_PADDING_X + rowIndex * (TREE_CARD_WIDTH + SIBLING_GAP),
      y: generationToY(personGeneration, TREE_CARD_HEIGHT),
      width: TREE_CARD_WIDTH,
      height: TREE_CARD_HEIGHT,
    });
  });

  return {
    people,
    positions,
    familyUnits,
    parentFamilyByPerson,
    partnerFamilyIdsByPerson,
    generations,
    componentAnchors: componentAnchors.map((blockId) => blockMembers.get(blockId)[0]),
  };
}
