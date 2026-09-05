import { addParentPair, addSibling, createEmptyPerson } from '../domain/familyGraph';

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

export function threeSiblingsScenario() {
  const people = [
    person('mother', 'Ана', '1950-04-12', 'female'),
    person('father', 'Әке', '1948-09-03', 'male'),
    person('first', 'Бірінші бала', '1971-02-02'),
    person('second', 'Екінші бала', '1982-09-12'),
  ];
  const relationships = [
    spouse('parents', 'mother', 'father'),
    parent('first-father', 'father', 'first'),
    parent('second-mother', 'mother', 'second'),
    parent('first-mother', 'mother', 'first'),
    parent('second-father', 'father', 'second'),
  ];
  const result = addSibling({
    people,
    relationships,
    personId: 'second',
    sibling: person('third', 'Үшінші бала', '1991-06-20'),
  });
  return { people: result.people, relationships: result.relationships, selectedId: 'third' };
}

export function stableBranchesScenario(withNewSibling = false) {
  const people = [
    person('z-grandfather-a', 'Ата A'), person('a-grandmother-a', 'Әже A'),
    person('y-grandfather-b', 'Ата B'), person('b-grandmother-b', 'Әже B'),
    person('x-unrelated-a', 'Бөлек ата'), person('c-unrelated-b', 'Бөлек әже'),
    person('father-main', 'Қабдығали'), person('mother-main', 'Қая'),
    person('unrelated-child', 'Бөлек ұрпақ'), person('magdan', 'Магдан'),
    person('existing-sibling', 'Латипа'),
  ].map((item, index) => ({
    ...item,
    createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString(),
  }));
  const relationships = [
    spouse('grandparents-a', 'z-grandfather-a', 'a-grandmother-a'),
    spouse('grandparents-b', 'y-grandfather-b', 'b-grandmother-b'),
    spouse('unrelated-pair', 'x-unrelated-a', 'c-unrelated-b'),
    spouse('main-pair', 'father-main', 'mother-main'),
    parent('ga-father', 'z-grandfather-a', 'father-main'),
    parent('gb-father', 'a-grandmother-a', 'father-main'),
    parent('ga-mother', 'y-grandfather-b', 'mother-main'),
    parent('gb-mother', 'b-grandmother-b', 'mother-main'),
    parent('unrelated-a-child', 'x-unrelated-a', 'unrelated-child'),
    parent('unrelated-b-child', 'c-unrelated-b', 'unrelated-child'),
    parent('father-magdan', 'father-main', 'magdan'),
    parent('mother-magdan', 'mother-main', 'magdan'),
    parent('father-existing', 'father-main', 'existing-sibling'),
    parent('mother-existing', 'mother-main', 'existing-sibling'),
  ];
  if (!withNewSibling) return { people, relationships, selectedId: 'magdan' };
  const result = addSibling({
    people,
    relationships,
    personId: 'magdan',
    sibling: {
      ...person('new-sibling', 'Қабылқақ'),
      createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, 20)).toISOString(),
    },
  });
  return { people: result.people, relationships: result.relationships, selectedId: 'new-sibling' };
}

export function crossedGrandparentsScenario() {
  const people = [
    person('zhuman', 'Жұман Тілеукеұлы'),
    person('maria', 'Мария Сққызы'),
    person('magipar', 'Мағыпар Әуілбекқызы'),
    person('sabikan', 'Сабиқан Асылұлы'),
    // Қауа intentionally predates Қабдығали to reproduce the old spouse-block order.
    person('qaua', 'Қауа Сабиқанқызы'),
    person('qabdygali', 'Қабдығали Жұманұлы'),
    person('magdan', 'Магдан Қабдығалиевич'),
    person('nurgul', 'Нұргүл Турарова'),
  ].map((item, index) => ({
    ...item,
    createdAt: new Date(Date.UTC(2021, 0, 1, 0, 0, index)).toISOString(),
  }));
  const relationships = [
    spouse('zhuman-maria', 'zhuman', 'maria'),
    spouse('magipar-sabikan', 'magipar', 'sabikan'),
    spouse('qabdygali-qaua', 'qabdygali', 'qaua'),
    spouse('magdan-nurgul', 'magdan', 'nurgul'),
    parent('zhuman-qabdygali', 'zhuman', 'qabdygali'),
    parent('maria-qabdygali', 'maria', 'qabdygali'),
    parent('magipar-qaua', 'magipar', 'qaua'),
    parent('sabikan-qaua', 'sabikan', 'qaua'),
    parent('qabdygali-magdan', 'qabdygali', 'magdan'),
    parent('qaua-magdan', 'qaua', 'magdan'),
  ];
  return { people, relationships, selectedId: 'magdan' };
}

export function viewportIslandsScenario() {
  const people = [
    person('zhuman-island', 'Жұман Тілеукеұлы'),
    person('maria-island', 'Мария Сққызы'),
    person('their-child', 'Қабдығали Жұманұлы'),
    person('new-mother-island', 'Новая мама'),
  ].map((item, index) => ({
    ...item,
    createdAt: new Date(Date.UTC(2022, 0, 1, 0, 0, index)).toISOString(),
  }));
  const relationships = [
    spouse('island-couple', 'zhuman-island', 'maria-island'),
    parent('island-a-child', 'zhuman-island', 'their-child'),
    parent('island-b-child', 'maria-island', 'their-child'),
  ];
  return { people, relationships, selectedId: 'new-mother-island' };
}

export function packedIslandsScenario() {
  const realBranch = crossedGrandparentsScenario();
  const testPeople = [
    person('test-grandmother', 'Новая мама', '', 'female'),
    person('test-grandfather', 'Новый папа', '', 'male'),
    person('test-mother', 'Новая мама', '', 'female'),
    person('test-father', 'Новый папа', '', 'male'),
    person('test-child', 'Тестовый ребёнок'),
  ].map((item, index) => ({
    ...item,
    createdAt: new Date(Date.UTC(2022, 0, 1, 0, 0, index)).toISOString(),
  }));
  const testRelationships = [
    spouse('test-grandparents', 'test-grandmother', 'test-grandfather'),
    spouse('test-parents', 'test-mother', 'test-father'),
    parent('test-grandmother-mother', 'test-grandmother', 'test-mother'),
    parent('test-grandfather-mother', 'test-grandfather', 'test-mother'),
    parent('test-mother-child', 'test-mother', 'test-child'),
    parent('test-father-child', 'test-father', 'test-child'),
  ];
  return {
    people: [...realBranch.people, ...testPeople],
    relationships: [...realBranch.relationships, ...testRelationships],
    selectedId: 'magdan',
  };
}

export function strictAnchorsScenario() {
  const people = [
    person('top-mother', 'Новая мама', '', 'female'),
    person('top-father', 'Новый папа', '', 'male'),
    person('placeholder', 'Новая мама', '', 'female'),
    person('right-mother', 'Новая мама', '', 'female'),
    person('right-father', 'Новый папа', '', 'male'),
    person('zhuman', 'Жұман Тілеукеұлы'),
    person('maria', 'Мәрия Сқаққызы'),
    person('magipar', 'Мағыпар Әуілбекқызы'),
    person('sabikan', 'Сабиқан Асылұлы'),
    person('qabdygali', 'Қабдығали Жұманұлы'),
    person('qaua', 'Қауа Сабиқанқызы'),
    person('magdan', 'Магдан Қабдығалиевич'),
    person('nurgul', 'Нургуль Турарова'),
    person('azhar', 'Ажар Магдановна'),
    person('daulet', 'Дәулет Қабдығали'),
  ].map((item, index) => ({
    ...item,
    createdAt: new Date(Date.UTC(2023, 0, 1, 0, 0, index)).toISOString(),
  }));
  const relationships = [
    spouse('top-pair', 'top-mother', 'top-father'),
    parent('top-mother-placeholder', 'top-mother', 'placeholder'),
    parent('top-father-placeholder', 'top-father', 'placeholder'),
    parent('placeholder-magipar', 'placeholder', 'magipar'),
    spouse('magipar-sabikan', 'magipar', 'sabikan'),
    parent('magipar-qaua', 'magipar', 'qaua'),
    parent('sabikan-qaua', 'sabikan', 'qaua'),
    spouse('right-pair', 'right-mother', 'right-father'),
    parent('right-mother-maria', 'right-mother', 'maria'),
    parent('right-father-maria', 'right-father', 'maria'),
    spouse('zhuman-maria', 'zhuman', 'maria'),
    parent('zhuman-qabdygali', 'zhuman', 'qabdygali'),
    parent('maria-qabdygali', 'maria', 'qabdygali'),
    spouse('qabdygali-qaua', 'qabdygali', 'qaua'),
    parent('qabdygali-magdan', 'qabdygali', 'magdan'),
    parent('qaua-magdan', 'qaua', 'magdan'),
    spouse('magdan-nurgul', 'magdan', 'nurgul'),
    parent('magdan-azhar', 'magdan', 'azhar'),
    parent('nurgul-azhar', 'nurgul', 'azhar'),
    parent('magdan-daulet', 'magdan', 'daulet'),
    parent('nurgul-daulet', 'nurgul', 'daulet'),
  ];
  return { people, relationships, selectedId: 'magdan' };
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

export function groundTruthScenario(step = 1) {
  const createdAt = (index) => new Date(Date.UTC(2024, 0, 1, 0, 0, index)).toISOString();
  const member = (id, firstName, gender, order) => ({
    ...person(id, firstName, '', gender),
    createdAt: createdAt(order),
  });
  const root = member('ground-root', 'Root', 'other', 0);
  let graph = { people: [root], relationships: [] };

  if (step >= 2) {
    graph = addParentPair({
      ...graph,
      childId: root.id,
      father: member('ground-father', 'Отец', 'male', 1),
      mother: member('ground-mother', 'Мать', 'female', 2),
    });
  }
  if (step >= 3) {
    graph = addParentPair({
      people: graph.people,
      relationships: graph.relationships,
      childId: 'ground-father',
      father: member('ground-paternal-grandfather', 'Дед1', 'male', 3),
      mother: member('ground-paternal-grandmother', 'Баба1', 'female', 4),
    });
  }
  if (step >= 4) {
    graph = addParentPair({
      people: graph.people,
      relationships: graph.relationships,
      childId: 'ground-mother',
      father: member('ground-maternal-grandfather', 'Дед2', 'male', 5),
      mother: member('ground-maternal-grandmother', 'Баба2', 'female', 6),
    });
  }
  if (step >= 5) {
    graph = addSibling({
      people: graph.people,
      relationships: graph.relationships,
      personId: 'ground-father',
      sibling: member('ground-paternal-sibling', 'Тётя/Дядя1', 'other', 7),
    });
  }
  if (step >= 6) {
    graph = addSibling({
      people: graph.people,
      relationships: graph.relationships,
      personId: 'ground-mother',
      sibling: member('ground-maternal-sibling', 'Тётя/Дядя2', 'other', 8),
    });
  }

  return { people: graph.people, relationships: graph.relationships, selectedId: root.id };
}

export function childDialogScenario(partnerCount = 0) {
  const selected = person('dialog-selected', 'Аян Тлеукенов', '1988-01-01', 'male');
  const activePartners = [
    person('dialog-partner-1', 'Айгүл Сәрсенова', '1990-01-01', 'female'),
    person('dialog-partner-2', 'Мадина Омарова', '1992-01-01', 'female'),
  ].slice(0, partnerCount);
  const formerPartner = person('dialog-former', 'Бұрынғы жұбай', '1989-01-01', 'female');
  const relationships = [
    ...activePartners.map((partnerPerson, index) => spouse(
      `dialog-active-${index}`,
      selected.id,
      partnerPerson.id,
    )),
    { id: 'dialog-divorced', type: 'divorced', personAId: selected.id, personBId: formerPartner.id },
  ];

  return {
    people: [selected, ...activePartners, formerPartner],
    relationships,
    selectedId: selected.id,
  };
}

export function freeXScenario() {
  const people = [
    { ...person('free-parent-a', 'Родитель A', '1960-01-01'), layoutX: 80 },
    { ...person('free-parent-b', 'Родитель B', '1962-01-01'), layoutX: 760 },
    { ...person('free-child-a', 'Ребёнок A', '1988-01-01'), layoutX: -120 },
    { ...person('free-child-b', 'Ребёнок B', '1991-01-01'), layoutX: 520 },
  ];
  const relationships = [
    spouse('free-couple', 'free-parent-a', 'free-parent-b'),
    parent('free-a-child-a', 'free-parent-a', 'free-child-a'),
    parent('free-b-child-a', 'free-parent-b', 'free-child-a'),
    parent('free-a-child-b', 'free-parent-a', 'free-child-b'),
    parent('free-b-child-b', 'free-parent-b', 'free-child-b'),
  ];
  return { people, relationships, selectedId: null };
}

export function getFamilyScenario(name) {
  if (name === 'siblings') return siblingScenario();
  if (name === 'dates') return datedChildrenScenario();
  if (name === 'large') return largeFamilyScenario();
  if (name === 'three-siblings') return threeSiblingsScenario();
  if (name === 'stable-before') return stableBranchesScenario(false);
  if (name === 'stable-after') return stableBranchesScenario(true);
  if (name === 'crossed-grandparents') return crossedGrandparentsScenario();
  if (name === 'viewport-islands') return viewportIslandsScenario();
  if (name === 'packed-islands') return packedIslandsScenario();
  if (name === 'strict-anchors') return strictAnchorsScenario();
  if (name === 'child-dialog-none') return childDialogScenario(0);
  if (name === 'child-dialog-one') return childDialogScenario(1);
  if (name === 'child-dialog-multiple') return childDialogScenario(2);
  if (name === 'free-x') return freeXScenario();
  if (name?.startsWith('ground-truth-')) {
    const step = Number(name.slice('ground-truth-'.length));
    if (Number.isInteger(step) && step >= 1 && step <= 6) return groundTruthScenario(step);
  }
  return null;
}
