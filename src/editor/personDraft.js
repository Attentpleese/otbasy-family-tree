export const mergePersonDraft = (draft, currentPerson) => ({
  ...draft,
  photoUrl: currentPerson.photoUrl || '',
});
