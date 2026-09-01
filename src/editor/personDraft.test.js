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
});
