import { describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../domain/familyGraph';
import { getCloseFamilyPath, routeConnections } from './connectionRouter';
import { buildFreeXTreeLayout, previewFreeXPositions } from './freeXLayout';
import { buildGenerationLayout } from './generationEngine';

const person = (id, layoutX = null) => createEmptyPerson({ id, firstName: id, layoutX });
const relationships = [
  { id: 'couple', type: 'spouse', personAId: 'parent-a', personBId: 'parent-b' },
  { id: 'parent-a-child', type: 'parent-child', parentId: 'parent-a', childId: 'child' },
  { id: 'parent-b-child', type: 'parent-child', parentId: 'parent-b', childId: 'child' },
];

describe('free X layout', () => {
  it('uses persisted X while preserving generated generation and Y', () => {
    const people = [person('parent-a', -320), person('parent-b', 480), person('child', 96)];
    const generated = buildGenerationLayout(people, relationships);
    const freeX = buildFreeXTreeLayout(people, relationships);

    people.forEach((item) => {
      expect(freeX.positions.get(item.id).x).toBe(item.layoutX);
      expect(freeX.positions.get(item.id).y).toBe(generated.positions.get(item.id).y);
      expect(freeX.generations.get(item.id)).toBe(generated.generations.get(item.id));
    });
    expect(freeX.persistedPositionIds).toEqual(new Set(['parent-a', 'parent-b', 'child']));
  });

  it('uses a deterministic row slot only for people without a persisted position', () => {
    const people = [person('parent-a', 900), person('parent-b'), person('child')];
    const freeX = buildFreeXTreeLayout(people, relationships);

    expect(freeX.positions.get('parent-a').x).toBe(900);
    expect(freeX.positions.get('parent-b').x).toBe(344);
    expect(freeX.positions.get('child').x).toBe(72);
  });

  it('routes relationships and close-family highlighting from persisted coordinates', () => {
    const people = [person('parent-a', 0), person('parent-b', 800), person('child', 160)];
    const freeX = buildFreeXTreeLayout(people, relationships);
    const routed = routeConnections(freeX, relationships);
    const couple = routed.coupleConnections[0];
    const family = routed.familyConnections[0];
    const closeFamily = getCloseFamilyPath(freeX, 'child');

    expect(couple.distant).toBe(true);
    expect(couple.path).toContain('H 916');
    expect(family.sourceX).toBe(516);
    expect(family.childAnchors[0].x).toBe(276);
    expect(closeFamily.familyIds).toEqual(new Set(['family:parent-a|parent-b']));
    expect(closeFamily.childIdsByFamily.get('family:parent-a|parent-b'))
      .toEqual(new Set(['child']));
  });

  it('expands bounds around negative cards and distant routed lines', () => {
    const people = [person('parent-a', -400), person('parent-b', 800), person('child', 160)];
    const freeX = buildFreeXTreeLayout(people, relationships);
    const routed = routeConnections(freeX, relationships);
    const couple = routed.coupleConnections[0];

    expect(freeX.bounds.left).toBeLessThan(-400);
    expect(freeX.bounds.top).toBeLessThanOrEqual(couple.channelY - 56);
    expect(freeX.bounds.left + freeX.bounds.width).toBeGreaterThan(1032);
    expect(freeX.bounds.top + freeX.bounds.height)
      .toBeGreaterThan(freeX.positions.get('child').y + freeX.positions.get('child').height);
  });

  it('previews several X positions while preserving every generated Y', () => {
    const people = [person('parent-a', 0), person('parent-b', 256), person('child', 128)];
    const freeX = buildFreeXTreeLayout(people, relationships);
    const preview = previewFreeXPositions(
      freeX,
      relationships,
      new Map([['parent-a', 64], ['parent-b', 320], ['child', 192]]),
    );

    ['parent-a', 'parent-b', 'child'].forEach((id) => {
      expect(preview.positions.get(id).x).toBe(freeX.positions.get(id).x + 64);
      expect(preview.positions.get(id).y).toBe(freeX.positions.get(id).y);
      expect(preview.generations.get(id)).toBe(freeX.generations.get(id));
    });
  });
});
