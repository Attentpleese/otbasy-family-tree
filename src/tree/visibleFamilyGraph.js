import { buildFamilyUnits } from './familyUnits';

export function visibleFamilyGraph(people, relationships, collapsedFamilies = new Set()) {
  if (!collapsedFamilies.size) return { people, relationships };
  const { familyUnits, parentFamilyByPerson } = buildFamilyUnits(people, relationships);
  const adjacency = new Map(people.map((person) => [person.id, new Set()]));
  const connect = (a, b) => {
    if (!adjacency.has(a) || !adjacency.has(b)) return;
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };
  relationships.forEach((relationship) => {
    if (['spouse', 'partner', 'divorced', 'sibling'].includes(relationship.type)) {
      connect(relationship.personAId, relationship.personBId);
    }
  });
  familyUnits.forEach((family) => family.partners.slice(1).forEach((id) => connect(family.partners[0], id)));

  const components = new Map();
  const componentByPerson = new Map();
  people.forEach(({ id }) => {
    if (componentByPerson.has(id)) return;
    const queue = [id];
    const members = new Set();
    while (queue.length) {
      const personId = queue.pop();
      if (members.has(personId)) continue;
      members.add(personId);
      componentByPerson.set(personId, id);
      queue.push(...adjacency.get(personId));
    }
    components.set(id, members);
  });
  const edges = familyUnits.filter((family) => family.partners.length && family.children.length)
    .flatMap((family) => family.children.map((childId) => ({
      familyId: family.id,
      from: componentByPerson.get(family.partners[0]),
      to: componentByPerson.get(childId),
    }))).filter((edge) => edge.from !== edge.to);
  const incoming = new Set(edges.map((edge) => edge.to));
  const queue = [...components.keys()].filter((id) => !incoming.has(id));
  const reached = new Set();
  // Only components reachable through expanded families are displayed. A
  // spouse without parents is not an independent root that reveals a hidden branch.
  while (queue.length) {
    const id = queue.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    edges.filter((edge) => edge.from === id && !collapsedFamilies.has(edge.familyId))
      .forEach((edge) => queue.push(edge.to));
  }
  const visible = new Set([...reached].flatMap((id) => [...components.get(id)]));
  return {
    people: people.filter((person) => visible.has(person.id)),
    relationships: relationships.filter((relationship) => relationship.type === 'parent-child'
      ? visible.has(relationship.parentId) && visible.has(relationship.childId) &&
        !collapsedFamilies.has(parentFamilyByPerson.get(relationship.childId))
      : visible.has(relationship.personAId) && visible.has(relationship.personBId)),
  };
}
