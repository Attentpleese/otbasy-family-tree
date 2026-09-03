import { supabase } from './supabaseClient';
import { normalizePerson, normalizeRelationship } from '../domain/familyGraph';

export const toPersonRow = (person) => ({
  id: person.id,
  first_name: person.firstName,
  last_name: person.lastName,
  patronymic: person.patronymic || null,
  gender: person.gender,
  birth_date: person.birthDate || null,
  death_date: person.deathDate || null,
  birth_place: person.birthPlace || null,
  clan: person.clan || null,
  family_order: person.familyOrder || {},
  ...(person.createdAt ? { created_at: person.createdAt } : {}),
  photo_url: person.photoUrl || null,
  notes: person.notes || null,
});

const fromPersonRow = (row) =>
  normalizePerson({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    patronymic: row.patronymic || '',
    gender: row.gender,
    birthDate: row.birth_date || '',
    deathDate: row.death_date || '',
    birthPlace: row.birth_place || '',
    clan: row.clan || '',
    familyOrder: row.family_order || {},
    createdAt: row.created_at || '',
    photoUrl: row.photo_url || '',
    notes: row.notes || '',
  });

export const toRelationshipRow = (relationship) => ({
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

export const savePeople = (people) =>
  supabase.from('people').upsert(people.map(toPersonRow), { onConflict: 'id' }).select();

export const saveRelationship = (relationship) =>
  supabase.from('relationships').upsert(toRelationshipRow(relationship), { onConflict: 'id' }).select().single();

export const saveRelationships = (relationships) =>
  supabase.from('relationships').upsert(relationships.map(toRelationshipRow), { onConflict: 'id' }).select();

export const saveFamilyGraphAdditions = (people, relationships) =>
  supabase.rpc('add_family_graph_members', {
    people_payload: people.map(toPersonRow),
    relationships_payload: relationships.map(toRelationshipRow),
  });

export const deletePerson = (personId) => supabase.from('people').delete().eq('id', personId);

export async function restoreFamilyGraph(target, current) {
  const targetPersonIds = new Set(target.people.map((person) => person.id));
  const targetRelationshipIds = new Set(target.relationships.map((relationship) => relationship.id));
  const removedRelationshipIds = current.relationships
    .filter((relationship) => !targetRelationshipIds.has(relationship.id))
    .map((relationship) => relationship.id);
  const removedPersonIds = current.people
    .filter((person) => !targetPersonIds.has(person.id))
    .map((person) => person.id);

  if (removedRelationshipIds.length) {
    const { error } = await supabase.from('relationships').delete().in('id', removedRelationshipIds);
    if (error) return { error };
  }

  if (target.people.length) {
    const { error } = await savePeople(target.people);
    if (error) return { error };
  }

  if (target.relationships.length) {
    const { error } = await saveRelationships(target.relationships);
    if (error) return { error };
  }

  if (removedPersonIds.length) {
    const { error } = await supabase.from('people').delete().in('id', removedPersonIds);
    if (error) return { error };
  }

  return { error: null };
}
