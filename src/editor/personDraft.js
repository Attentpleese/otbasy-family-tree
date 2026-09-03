export const mergePersonDraft = (draft, currentPerson) => ({
  ...draft,
  photoUrl: currentPerson.photoUrl || '',
  familyOrder: currentPerson.familyOrder || {},
  familyLayoutOrder: currentPerson.familyLayoutOrder ?? null,
});
