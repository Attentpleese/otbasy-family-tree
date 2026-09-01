import { describe, expect, it } from 'vitest';
import kz from './locales/kz.json';
import ru from './locales/ru.json';

describe('person field translations', () => {
  it('provides the patronymic label in both supported languages', () => {
    expect(ru.fields.patronymic).toBe('Отчество');
    expect(kz.fields.patronymic).toBe('Әкесінің аты');
  });

  it('provides the clan label and explanation in both supported languages', () => {
    expect(ru.fields.clan).toBe('Ру');
    expect(kz.fields.clan).toBe('Ру');
    expect(ru.fields.clanHint).toContain('Найман');
    expect(kz.fields.clanHint).toContain('Найман');
  });
});
