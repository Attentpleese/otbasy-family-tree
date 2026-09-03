import { getActivePartners } from '../domain/familyGraph';

export function getChildCreationOptions(people, relationships, selectedId) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const partners = getActivePartners(relationships, selectedId)
    .map((partnerId) => peopleById.get(partnerId))
    .filter(Boolean);

  if (!partners.length) {
    return [
      { type: 'new-partner' },
      { type: 'single' },
    ];
  }

  return [
    ...partners.map((partner) => ({ type: 'existing', partnerId: partner.id, partner })),
    { type: 'new-partner' },
  ];
}
