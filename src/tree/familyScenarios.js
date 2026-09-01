import { addSibling, createEmptyPerson } from '../domain/familyGraph';

const person = (id, firstName, birthDate = '', gender = 'other') =>
  createEmptyPerson({ id, firstName, birthDate, gender });
const spouse = (id, a, b) => ({ id, type: 'spouse', personAId: a, personBId: b });
const parent = (id, parentId, childId) => ({ id, type: 'parent-child', parentId, childId });

export function siblingScenario() {
  const people = [
    person('father-a', 'Қабдығали Жұманұлы', '1918-01-01', 'male'),
    person('mother-a', 'Қая Сабиқанқызы', '1922-01-01', 'female'),
    person('magdan', 'Магдан Қабдығалиевич Тлеукенов', '1967-01-01', 'male'),
    person('father-b', 'Жұман Тілеукенұлы', '1916-01-01', 'male'),
    person('mother-b', 'Мәрия Сқаққызы', '1920-01-01', 'female'),
    person('nurgul', 'Нұргүл Турарова', '', 'female'),
    person('latipa', 'Латипа Турарова', '', 'female'),
    person('child', 'Дәулет Қабдығали', '1999-02-21', 'male'),
  ];
  const relationships = [
    spouse('couple-a', 'father-a', 'mother-a'), spouse('couple-b', 'father-b', 'mother-b'),
    spouse('couple-main', 'magdan', 'nurgul'),
    parent('fa-m', 'father-a', 'magdan'), parent('ma-m', 'mother-a', 'magdan'),
    parent('fb-n', 'father-b', 'nurgul'), parent('mb-n', 'mother-b', 'nurgul'),
    parent('fb-l', 'father-b', 'latipa'), parent('mb-l', 'mother-b', 'latipa'),
    parent('m-child', 'magdan', 'child'), parent('n-child', 'nurgul', 'child'),
  ];
  const result = addSibling({
    people,
    relationships,
    personId: 'magdan',
    sibling: person('new-sibling', 'Қабылқақ Қабдығалиевич Тлеукенов'),
  });
  return { people: result.people, relationships: result.relationships, selectedId: 'new-sibling' };
}

export function datedChildrenScenario() {
  const people = [person('p1', 'Әке', '1940-01-01'), person('p2', 'Ана', '1944-01-01'),
    person('young', 'Кіші бала', '1999-07-01'), person('old', 'Үлкен бала', '1971-02-02'),
    person('middle-2', 'Үшінші бала', '1990-05-20'), person('middle-1', 'Екінші бала', '1982-09-12')];
  const relationships = [spouse('parents', 'p1', 'p2'), ...['young', 'old', 'middle-2', 'middle-1']
    .flatMap((child) => [parent(`p1-${child}`, 'p1', child), parent(`p2-${child}`, 'p2', child)])];
  return { people, relationships, selectedId: 'old' };
}

export function largeFamilyScenario() {
  const people = [person('root-a', 'Ата', '1935-01-01'), person('root-b', 'Әже', '1938-01-01')];
  const relationships = [spouse('roots', 'root-a', 'root-b')];
  for (let index = 1; index <= 8; index += 1) {
    const id = `child-${index}`;
    people.push(person(id, `${index}-бала`, `${1960 + index * 3}-01-01`));
    relationships.push(parent(`a-${id}`, 'root-a', id), parent(`b-${id}`, 'root-b', id));
  }
  people.push(person('partner', 'Жұбайы', '1968-01-01'));
  relationships.push(spouse('child-family', 'child-3', 'partner'));
  for (let index = 1; index <= 4; index += 1) {
    const id = `grand-${index}`;
    people.push(person(id, `${index}-немере`, `${1990 + index * 2}-01-01`));
    relationships.push(parent(`c-${id}`, 'child-3', id), parent(`partner-${id}`, 'partner', id));
  }
  return { people, relationships, selectedId: 'child-3' };
}

export function getFamilyScenario(name) {
  if (name === 'siblings') return siblingScenario();
  if (name === 'dates') return datedChildrenScenario();
  if (name === 'large') return largeFamilyScenario();
  return null;
}
