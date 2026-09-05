import { describe, expect, it } from 'vitest';
import { mergePersonDraft } from './personDraft';

describe('person editor draft', () => {
  it('preserves a photo uploaded after the details form was opened', () => {
    const staleDraft = { id: 'person-1', firstName: 'Даулет', photoUrl: '' };
    const currentPerson = { ...staleDraft, photoUrl: 'https://example.supabase.co/person-1/photo.webp' };

    expect(mergePersonDraft(staleDraft, currentPerson)).toMatchObject({
      firstName: 'Даулет',
      photoUrl: 'https://example.supabase.co/person-1/photo.webp',
    });
  });

  it('does not restore an old photo after it was deleted', () => {
    const staleDraft = { id: 'person-1', firstName: 'Даулет', photoUrl: 'old-photo.webp' };
    const currentPerson = { ...staleDraft, photoUrl: '' };

    expect(mergePersonDraft(staleDraft, currentPerson).photoUrl).toBe('');
  });

  it('preserves sibling order changed after the form was opened', () => {
    const staleDraft = { id: 'person-1', firstName: 'Даулет', familyOrder: {} };
    const currentPerson = { ...staleDraft, familyOrder: { 'family:a|b': 2 } };
    expect(mergePersonDraft(staleDraft, currentPerson).familyOrder).toEqual({ 'family:a|b': 2 });
  });

  it('preserves persisted horizontal position changed after the form was opened', () => {
    const staleDraft = { id: 'person-1', firstName: 'Даулет', layoutX: 120 };
    const currentPerson = { ...staleDraft, layoutX: 448.5 };
    expect(mergePersonDraft(staleDraft, currentPerson).layoutX).toBe(448.5);
  });
});
