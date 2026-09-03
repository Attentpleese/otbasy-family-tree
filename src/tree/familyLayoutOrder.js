import { buildFamilyTreeLayout } from './familyTreeLayout';

const findPersonRow = (layout, personId) => layout.familyLayoutRows
  .find((row) => row.groups.some((group) => group.personIds.includes(personId)));

export function getFamilyLayoutMoveState(people, relationships, personId) {
  if (!personId) return { canMoveLeft: false, canMoveRight: false };
  const layout = buildFamilyTreeLayout(people, relationships);
  const row = findPersonRow(layout, personId);
  const index = row?.groups.findIndex((group) => group.personIds.includes(personId)) ?? -1;
  return {
    canMoveLeft: index > 0,
    canMoveRight: Boolean(row && index >= 0 && index < row.groups.length - 1),
  };
}

export function moveFamilyLayoutGroup(people, relationships, personId, direction) {
  if (![-1, 1].includes(direction)) return null;
  const layout = buildFamilyTreeLayout(people, relationships);
  const row = findPersonRow(layout, personId);
  const index = row?.groups.findIndex((group) => group.personIds.includes(personId)) ?? -1;
  const nextIndex = index + direction;
  if (!row || index < 0 || nextIndex < 0 || nextIndex >= row.groups.length) return null;

  const groups = [...row.groups];
  [groups[index], groups[nextIndex]] = [groups[nextIndex], groups[index]];
  const orderByPerson = new Map(groups.flatMap((group, order) =>
    group.personIds.map((id) => [id, order])));
  const updatedPeople = people.map((person) => orderByPerson.has(person.id)
    ? { ...person, familyLayoutOrder: orderByPerson.get(person.id) }
    : person);

  return {
    people: updatedPeople,
    changedPeople: updatedPeople.filter((person) => orderByPerson.has(person.id)),
    componentId: row.componentId,
    generation: row.generation,
  };
}
