import { describe, expect, it } from 'vitest';
import kz from './locales/kz.json';
import ru from './locales/ru.json';

describe('person field translations', () => {
  it('provides the patronymic label in both supported languages', () => {
    expect(ru.fields.patronymic).toBe('Отчество');
    expect(kz.fields.patronymic).toBe('Әкесінің аты');
  });
});
