import { describe, expect, it } from 'vitest';
import {
  generatePatronymic,
  getChangedPatronymicPeople,
  regeneratePatronymics,
} from './patronymics';

const person = (id, overrides = {}) => ({
  id,
  firstName: id,
  patronymic: '',
  gender: 'other',
  ...overrides,
});

const parentLink = (parentId, childId) => ({
  type: 'parent-child',
  parentId,
  childId,
});

describe('Kazakh patronymic generation', () => {
  it('joins the father name to the gender-specific suffix', () => {
    expect(generatePatronymic('Қабдығали', 'male')).toBe('Қабдығалиұлы');
    expect(generatePatronymic('Қабдығали', 'female')).toBe('Қабдығалиқызы');
    expect(generatePatronymic('Қабдығали', 'other')).toBeNull();
  });

  it('overwrites an existing patronymic when a known father is present', () => {
    const people = [
      person('father', { firstName: 'Қабдығали', gender: 'male' }),
      person('daughter', { gender: 'female', patronymic: 'Кабдыгалиева' }),
    ];
    const result = regeneratePatronymics(people, [parentLink('father', 'daughter')]);

    expect(result[1].patronymic).toBe('Қабдығалиқызы');
  });

  it('recalculates children after the father name or child gender changes', () => {
    const relationships = [parentLink('father', 'child')];
    const renamedFather = person('father', { firstName: 'Мағдан', gender: 'male' });
    const son = person('child', { gender: 'male', patronymic: 'Магданқызы' });

    const result = regeneratePatronymics([renamedFather, son], relationships);

    expect(result[1].patronymic).toBe('Мағданұлы');
  });

  it('leaves a manually entered patronymic unchanged when no father is known', () => {
    const child = person('child', { gender: 'female', patronymic: 'Серікболқызы' });
    expect(regeneratePatronymics([child], [])[0]).toBe(child);
  });

  it('returns only people whose patronymics changed', () => {
    const previous = [person('father'), person('child', { patronymic: 'Ескі' })];
    const next = [previous[0], { ...previous[1], patronymic: 'Жаңа' }];
    expect(getChangedPatronymicPeople(previous, next).map(({ id }) => id)).toEqual(['child']);
  });
});
