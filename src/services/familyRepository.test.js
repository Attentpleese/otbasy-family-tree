import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { createEmptyPerson, normalizeRelationship } from '../domain/familyGraph';
import {
  fetchFamilyGraph,
  fromPersonRow,
  saveFamilyGraphAdditions,
  savePeople,
  toPersonRow,
} from './familyRepository';

describe('atomic family graph persistence', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.from.mockReset();
    mocks.upsert.mockReset();
    mocks.select.mockReset();
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
    mocks.upsert.mockReturnValue({ select: mocks.select });
    mocks.select.mockResolvedValue({ error: null });
  });

  it('sends all new people and relationships through one transactional RPC call', async () => {
    const people = [
      createEmptyPerson({
        id: '11111111-1111-4111-8111-111111111111',
        firstName: 'Партнёр',
        birthDate: '1967-01-01',
        birthDatePrecision: 'year',
      }),
      createEmptyPerson({ id: '22222222-2222-4222-8222-222222222222', firstName: 'Ребёнок' }),
    ];
    const relationships = [
      normalizeRelationship({ id: '33333333-3333-4333-8333-333333333333', type: 'spouse', personAId: 'selected', personBId: people[0].id }),
      normalizeRelationship({ id: '44444444-4444-4444-8444-444444444444', type: 'parent-child', parentId: 'selected', childId: people[1].id }),
      normalizeRelationship({ id: '55555555-5555-4555-8555-555555555555', type: 'parent-child', parentId: people[0].id, childId: people[1].id }),
    ];

    await saveFamilyGraphAdditions(people, relationships);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('add_family_graph_members', {
      people_payload: expect.arrayContaining([expect.objectContaining({
        first_name: 'Партнёр',
        birth_date: '1967-01-01',
        birth_date_precision: 'year',
      })]),
      relationships_payload: expect.arrayContaining([
        expect.objectContaining({ type: 'spouse' }),
        expect.objectContaining({ type: 'parent-child' }),
      ]),
    });
  });

  it('serializes optional family layout order without inventing a default rank', () => {
    expect(toPersonRow(createEmptyPerson()).family_layout_order).toBeNull();
    expect(toPersonRow(createEmptyPerson({ familyLayoutOrder: 4 })).family_layout_order).toBe(4);
  });

  it('round-trips an optional finite persisted horizontal position', () => {
    expect(toPersonRow(createEmptyPerson()).layout_x).toBeNull();
    expect(toPersonRow(createEmptyPerson({ layoutX: 384.5 })).layout_x).toBe(384.5);
    expect(toPersonRow(createEmptyPerson({ layoutX: Number.NaN })).layout_x).toBeNull();
    expect(fromPersonRow({
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Person',
      last_name: '',
      gender: 'other',
      layout_x: 384.5,
    }).layoutX).toBe(384.5);
  });

  it('persists a normalized layout row in one batch upsert', async () => {
    const people = [
      createEmptyPerson({ id: '11111111-1111-4111-8111-111111111111', familyLayoutOrder: 0 }),
      createEmptyPerson({ id: '22222222-2222-4222-8222-222222222222', familyLayoutOrder: 1 }),
    ];

    await savePeople(people);

    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith('people');
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ family_layout_order: 0 }),
        expect.objectContaining({ family_layout_order: 1 }),
      ]),
      { onConflict: 'id' },
    );
  });

  it('loads the graph through the explicitly supplied authenticated client', async () => {
    const peopleOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'person-1', first_name: 'Viewer', last_name: '', gender: 'other' }],
      error: null,
    });
    const relationshipsOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = {
      from: vi.fn((table) => ({
        select: vi.fn(() => ({
          order: table === 'people' ? peopleOrder : relationshipsOrder,
        })),
      })),
    };

    const graph = await fetchFamilyGraph(client);

    expect(client.from).toHaveBeenCalledWith('people');
    expect(client.from).toHaveBeenCalledWith('relationships');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(graph.error).toBeNull();
    expect(graph.people[0].firstName).toBe('Viewer');
  });
});
