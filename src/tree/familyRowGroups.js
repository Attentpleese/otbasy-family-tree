// Family order is a hard constraint; barycentres may only move whole groups.
export function orderByFamilies(
  ids,
  families,
  resolve = (id) => id,
  {
    partnerRelationships = [],
    partnerPlacement = 'after',
    slotFamilies = families,
    slotHostByPerson,
  } = {},
) {
  const remaining = new Set(ids);
  const incoming = new Map(ids.map((id) => [id, new Set()]));
  const familyPriority = [];
  families.forEach((family) => {
    const children = [...new Set(family.children.map(resolve))].filter((id) => remaining.has(id));
    if (children.length > 1) familyPriority.push(...children);
    children.slice(1).forEach((id, index) => incoming.get(id).add(children[index]));
  });
  const result = [];
  const priority = [...new Set([...familyPriority, ...ids])];
  while (remaining.size) {
    // Conflicting family orders (e.g. intermarriage) have a stable fallback.
    const id = priority.find((candidate) => remaining.has(candidate) &&
      [...incoming.get(candidate)].every((parent) => !remaining.has(parent))) || remaining.values().next().value;
    remaining.delete(id);
    result.push(id);
  }
  if (!partnerRelationships.length) return result;

  const resultIndex = new Map(result.map((id, index) => [id, index]));
  const familySlots = slotFamilies.map((family, familyIndex) => {
    const children = [...new Set(family.children.map(resolve))]
      .filter((id) => resultIndex.has(id));
    return {
      family,
      familyIndex,
      children,
      order: Number.isFinite(family.displayOrder) ? family.displayOrder : Number.MAX_SAFE_INTEGER,
    };
  }).filter(({ children }) => children.length);
  const compareFamilySlots = (a, b) =>
    a.order - b.order || a.familyIndex - b.familyIndex || a.family.id.localeCompare(b.family.id);
  familySlots.sort(compareFamilySlots);

  const familySlotsByChild = new Map();
  familySlots.forEach((familySlot) => {
    familySlot.children.forEach((id, index) => {
      familySlotsByChild.set(id, [
        ...(familySlotsByChild.get(id) || []),
        { ...familySlot, index, count: familySlot.children.length },
      ]);
    });
  });
  const childSlot = (id) => familySlotsByChild.get(id)?.[0];

  const attachments = new Map();
  const attachedPartners = new Set();
  [...partnerRelationships].sort((left, right) => {
    const leftIds = [resolve(left.personAId), resolve(left.personBId)];
    const rightIds = [resolve(right.personAId), resolve(right.personBId)];
    return Math.min(...leftIds.map((id) => resultIndex.get(id) ?? Number.MAX_SAFE_INTEGER)) -
      Math.min(...rightIds.map((id) => resultIndex.get(id) ?? Number.MAX_SAFE_INTEGER));
  }).forEach((relationship) => {
    const a = resolve(relationship.personAId);
    const b = resolve(relationship.personBId);
    if (!resultIndex.has(a) || !resultIndex.has(b)) return;
    const familyA = childSlot(a);
    const familyB = childSlot(b);
    let anchor;
    let partner;
    if (familyA && familyB) {
      const aOwnsSlot = familyA.family.id === familyB.family.id
        ? familyA.index <= familyB.index
        : compareFamilySlots(familyA, familyB) <= 0;
      anchor = aOwnsSlot ? a : b;
      partner = aOwnsSlot ? b : a;
    } else if (familyA || familyB) {
      anchor = familyA ? a : b;
      partner = familyA ? b : a;
    } else {
      const aFirst = resultIndex.get(a) <= resultIndex.get(b);
      anchor = aFirst ? a : b;
      partner = aFirst ? b : a;
    }
    if (attachedPartners.has(partner)) return;
    attachments.set(anchor, [...(attachments.get(anchor) || []), partner]);
    attachedPartners.add(partner);
    if (familyA && familyB && familyA.family.id !== familyB.family.id) {
      slotHostByPerson?.set(partner, anchor);
    }
  });

  const expandSlot = (id, ancestors = new Set()) => {
    if (ancestors.has(id)) return [id];
    const nextAncestors = new Set([...ancestors, id]);
    const partners = [...(attachments.get(id) || [])]
      .sort((a, b) => resultIndex.get(a) - resultIndex.get(b));
    const expandedPartners = partners.flatMap((partner) => expandSlot(partner, nextAncestors));
    const slot = childSlot(id);
    const placeBefore = partnerPlacement === 'outer' && slot && slot.index < (slot.count - 1) / 2;
    return placeBefore ? [...expandedPartners, id] : [id, ...expandedPartners];
  };
  return result
    .filter((id) => !attachedPartners.has(id))
    .flatMap((id) => expandSlot(id));
}

export function groupFamilyRow(row, families, blockIdByPerson, gap) {
  const byId = new Map(row.map((block) => [block.id, block]));
  const parent = new Map(row.map((block) => [block.id, block.id]));
  const find = (id) => {
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  families.forEach((family) => {
    const ids = [...new Set(family.children.map((id) => blockIdByPerson.get(id)))].filter((id) => byId.has(id));
    ids.slice(1).forEach((id) => parent.set(find(id), find(ids[0])));
  });
  const groups = new Map();
  row.forEach((block) => {
    const root = find(block.id);
    groups.set(root, [...(groups.get(root) || []), block.id]);
  });
  return [...groups.entries()].map(([id, ids]) => {
    const ordered = orderByFamilies(ids, families, (personId) => blockIdByPerson.get(personId));
    const width = ordered.reduce((sum, blockId) => sum + byId.get(blockId).width, 0) + gap * (ordered.length - 1);
    let cursor = -width / 2;
    const members = ordered.map((blockId) => {
      const block = byId.get(blockId);
      const offset = cursor + block.width / 2;
      cursor += block.width + gap;
      return { block, offset };
    });
    return { id, width, members };
  });
}
