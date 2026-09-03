import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: mocks.rpc },
}));

import { createEmptyPerson, normalizeRelationship } from '../domain/familyGraph';
import { saveFamilyGraphAdditions } from './familyRepository';

describe('atomic family graph persistence', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it('sends all new people and relationships through one transactional RPC call', async () => {
    const people = [
      createEmptyPerson({ id: '11111111-1111-4111-8111-111111111111', firstName: 'Партнёр' }),
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
      people_payload: expect.arrayContaining([expect.objectContaining({ first_name: 'Партнёр' })]),
      relationships_payload: expect.arrayContaining([
        expect.objectContaining({ type: 'spouse' }),
        expect.objectContaining({ type: 'parent-child' }),
      ]),
    });
  });
});
