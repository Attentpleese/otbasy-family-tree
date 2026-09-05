import { describe, expect, it } from 'vitest';
import {
  assignGenerations,
  assignPersonGenerations,
  generationToY,
} from './generationEngine';

describe('generation engine', () => {
  it('keeps partners on one row and places parents and children on adjacent generations', () => {
    const result = assignGenerations({
      blockMembers: new Map([
        ['parents', ['parent-a', 'parent-b']],
        ['partner', ['partner']],
        ['child', ['child']],
      ]),
      parentBlocksByChildBlock: new Map([['child', new Set(['parents'])]]),
      childBlocksByParentBlock: new Map([['parents', new Set(['child'])]]),
      sameGenerationBlocks: new Map([
        ['parents', new Set(['partner'])],
        ['partner', new Set(['parents'])],
        ['child', new Set()],
      ]),
      personOrder: new Map([
        ['parent-a', 0],
        ['parent-b', 1],
        ['partner', 2],
        ['child', 3],
      ]),
    });

    expect(result.generation.get('parents')).toBe(0);
    expect(result.generation.get('partner')).toBe(0);
    expect(result.generation.get('child')).toBe(1);
  });

  it('maps block generations and Y without consulting horizontal layout', () => {
    const people = [{ id: 'parent' }, { id: 'child' }];
    const personGenerations = assignPersonGenerations({
      people,
      blockIdByPerson: new Map([['parent', 'parent-block'], ['child', 'child-block']]),
      blockGenerations: new Map([['parent-block', -1], ['child-block', 0]]),
    });

    expect(personGenerations).toEqual(new Map([['parent', -1], ['child', 0]]));
    expect(generationToY(-1, 112)).toBe(-180);
    expect(generationToY(0, 112)).toBe(56);
    expect(generationToY(1, 112)).toBe(292);
  });
});
