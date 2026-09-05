const PATRONYMIC_SUFFIX_BY_GENDER = {
  male: 'ұлы',
  female: 'қызы',
};

export const generatePatronymic = (fatherFirstName, childGender) => {
  const firstName = String(fatherFirstName || '').trim();
  const suffix = PATRONYMIC_SUFFIX_BY_GENDER[childGender];
  return firstName && suffix ? `${firstName}${suffix}` : null;
};

export const regeneratePatronymics = (people, relationships) => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const fatherIdsByChild = new Map();

  relationships.forEach((relationship) => {
    if (relationship.type !== 'parent-child') return;
    const parent = peopleById.get(relationship.parentId);
    if (parent?.gender !== 'male') return;
    const fatherIds = fatherIdsByChild.get(relationship.childId) || new Set();
    fatherIds.add(parent.id);
    fatherIdsByChild.set(relationship.childId, fatherIds);
  });

  return people.map((person) => {
    const fatherIds = [...(fatherIdsByChild.get(person.id) || [])];
    if (fatherIds.length !== 1) return person;
    const father = peopleById.get(fatherIds[0]);
    const patronymic = generatePatronymic(father?.firstName, person.gender);
    if (!patronymic || patronymic === person.patronymic) return person;
    return { ...person, patronymic };
  });
};

export const getChangedPatronymicPeople = (previousPeople, nextPeople) => {
  const previousById = new Map(previousPeople.map((person) => [person.id, person]));
  return nextPeople.filter((person) => previousById.get(person.id)?.patronymic !== person.patronymic);
};
