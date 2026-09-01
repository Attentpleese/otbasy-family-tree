// Family order is a hard constraint; barycentres may only move whole groups.
export function orderByFamilies(ids, families, resolve = (id) => id) {
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
  return result;
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
