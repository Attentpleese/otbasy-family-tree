import { supabase } from './supabaseClient';
import { normalizePerson, normalizeRelationship } from '../domain/familyGraph';

const toPersonRow = (person) => ({
  id: person.id,
  first_name: person.firstName,
  last_name: person.lastName,
  maiden_name: person.maidenName || null,
  gender: person.gender,
  birth_date: person.birthDate || null,
  death_date: person.deathDate || null,
  birth_place: person.birthPlace || null,
  photo_url: person.photoUrl || null,
  notes: person.notes || null,
});

const fromPersonRow = (row) =>
  normalizePerson({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    maidenName: row.maiden_name || '',
    gender: row.gender,
    birthDate: row.birth_date || '',
    deathDate: row.death_date || '',
    birthPlace: row.birth_place || '',
    photoUrl: row.photo_url || '',
    notes: row.notes || '',
  });

const toRelationshipRow = (relationship) => ({
  id: relationship.id,
  type: relationship.type,
  parent_id: relationship.parentId || null,
  child_id: relationship.childId || null,
  person_a_id: relationship.personAId || null,
  person_b_id: relationship.personBId || null,
  start_date: relationship.startDate || null,
  end_date: relationship.endDate || null,
});

const fromRelationshipRow = (row) =>
  normalizeRelationship({
    id: row.id,
    type: row.type,
    parentId: row.parent_id || undefined,
    childId: row.child_id || undefined,
    personAId: row.person_a_id || undefined,
    personBId: row.person_b_id || undefined,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
  });

export async function fetchFamilyGraph() {
  const [peopleResponse, relationshipsResponse] = await Promise.all([
    supabase.from('people').select('*').order('created_at'),
    supabase.from('relationships').select('*').order('created_at'),
  ]);

  if (peopleResponse.error || relationshipsResponse.error) {
    return {
      people: [],
      relationships: [],
      error: peopleResponse.error || relationshipsResponse.error,
    };
  }

  return {
    people: peopleResponse.data.map(fromPersonRow),
    relationships: relationshipsResponse.data.map(fromRelationshipRow),
    error: null,
  };
}

export const savePerson = (person) =>
  supabase.from('people').upsert(toPersonRow(person), { onConflict: 'id' }).select().single();

export const saveRelationship = (relationship) =>
  supabase.from('relationships').upsert(toRelationshipRow(relationship), { onConflict: 'id' }).select().single();
