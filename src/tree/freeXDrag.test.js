import { describe, expect, it, vi } from 'vitest';
import {
  buildDragPreviewPositions,
  commitFreeXGroupMove,
  getDragGroupPersonIds,
  snapFreeXPosition,
} from './freeXDrag';

const position = (x) => ({ x, y: 56, width: 232, height: 112 });
const layout = (entries, parentFamilies = []) => ({
  positions: new Map(entries.map(([id, x]) => [id, position(x)])),
  generations: new Map(entries.map(([id]) => [id, 0])),
  parentFamilyByPerson: new Map(parentFamilies),
});

describe('free X drag snapping', () => {
  it('snaps an active spouse to a 256px center distance', () => {
    const result = snapFreeXPosition({
      layout: layout([['a', 0], ['b', 500]]),
      relationships: [{ id: 'pair', type: 'spouse', personAId: 'a', personBId: 'b' }],
      personId: 'b',
      proposedX: 273,
    });

    expect(result.x).toBe(256);
    expect(result.targetDistance).toBe(256);
    expect(result.snappedToPersonId).toBe('a');
  });

  it('snaps siblings to a 272px center distance', () => {
    const result = snapFreeXPosition({
      layout: layout([['a', 0], ['b', 500]], [['a', 'family'], ['b', 'family']]),
      relationships: [],
      personId: 'b',
      proposedX: 286,
    });

    expect(result.x).toBe(272);
    expect(result.targetDistance).toBe(272);
  });

  it('does not snap beyond 20px or to a non-neighboring relative', () => {
    const relationships = [
      { id: 'pair', type: 'spouse', personAId: 'a', personBId: 'c' },
    ];
    const currentLayout = layout([['a', 0], ['between', 250], ['c', 700]]);

    expect(snapFreeXPosition({
      layout: currentLayout,
      relationships,
      personId: 'c',
      proposedX: 290,
    })).toEqual({ x: 290, snappedToPersonId: null });
    expect(snapFreeXPosition({
      layout: layout([['a', 0], ['c', 700]]),
      relationships,
      personId: 'c',
      proposedX: 276,
    }).x).toBe(256);
  });

  it('keeps snapping within the dragged generation', () => {
    const currentLayout = layout([['a', 0], ['b', 500]]);
    currentLayout.generations.set('a', -1);
    const result = snapFreeXPosition({
      layout: currentLayout,
      relationships: [{ id: 'pair', type: 'spouse', personAId: 'a', personBId: 'b' }],
      personId: 'b',
      proposedX: 260,
    });

    expect(result).toEqual({ x: 260, snappedToPersonId: null });
  });

  it('collects recursive descendants and each descendant\'s active spouse', () => {
    const relationships = [
      { type: 'spouse', personAId: 'root', personBId: 'root-partner' },
      { type: 'parent-child', parentId: 'root', childId: 'child' },
      { type: 'spouse', personAId: 'child', personBId: 'child-partner' },
      { type: 'parent-child', parentId: 'child', childId: 'grandchild' },
      { type: 'partner', personAId: 'grandchild', personBId: 'grandchild-partner' },
    ];

    expect(getDragGroupPersonIds(relationships, 'root')).toEqual(new Set([
      'root',
      'root-partner',
      'child',
      'child-partner',
      'grandchild',
      'grandchild-partner',
    ]));
  });

  it('moves only a leaf person without a partner or descendants', () => {
    const relationships = [
      { type: 'parent-child', parentId: 'parent-a', childId: 'leaf' },
      { type: 'parent-child', parentId: 'parent-b', childId: 'leaf' },
    ];

    expect(getDragGroupPersonIds(relationships, 'leaf')).toEqual(new Set(['leaf']));
  });

  it('moves exactly a childless couple, excludes their parents, and snaps only the leader', () => {
    const relationships = [
      { type: 'parent-child', parentId: 'leader-parent', childId: 'leader' },
      { type: 'parent-child', parentId: 'partner-parent', childId: 'partner' },
      { type: 'spouse', personAId: 'leader', personBId: 'partner' },
      { type: 'sibling', personAId: 'leader', personBId: 'external-sibling' },
    ];
    const affectedPersonIds = getDragGroupPersonIds(relationships, 'leader');

    expect(affectedPersonIds).toEqual(new Set(['leader', 'partner']));
    expect(affectedPersonIds.has('leader-parent')).toBe(false);
    expect(affectedPersonIds.has('partner-parent')).toBe(false);

    const result = snapFreeXPosition({
      layout: layout([
        ['leader', 0],
        ['partner', 250],
        ['external-sibling', 500],
      ]),
      relationships,
      personId: 'leader',
      proposedX: 240,
      excludedPersonIds: affectedPersonIds,
    });

    expect(result.x).toBe(228);
    expect(result.snappedToPersonId).toBe('external-sibling');
    expect(result.targetDistance).toBe(272);
  });

  it('includes multiple active partners but excludes former partners', () => {
    const relationships = [
      { type: 'spouse', personAId: 'root', personBId: 'spouse' },
      { type: 'partner', personAId: 'root', personBId: 'partner' },
      { type: 'divorced', personAId: 'root', personBId: 'former' },
    ];

    expect(getDragGroupPersonIds(relationships, 'root'))
      .toEqual(new Set(['root', 'spouse', 'partner']));
  });

  it('never crosses upward, sideways, or into a spouse-only branch', () => {
    const relationships = [
      { type: 'parent-child', parentId: 'root-parent', childId: 'root' },
      { type: 'sibling', personAId: 'root', personBId: 'root-sibling' },
      { type: 'spouse', personAId: 'root', personBId: 'root-partner' },
      { type: 'parent-child', parentId: 'partner-parent', childId: 'root-partner' },
      { type: 'parent-child', parentId: 'root-partner', childId: 'partner-stepchild' },
      { type: 'parent-child', parentId: 'root', childId: 'shared-child' },
      { type: 'parent-child', parentId: 'root-partner', childId: 'shared-child' },
    ];

    expect(getDragGroupPersonIds(relationships, 'root'))
      .toEqual(new Set(['root', 'root-partner', 'shared-child']));
  });

  it('terminates safely when malformed parent-child data contains a cycle', () => {
    const relationships = [
      { type: 'parent-child', parentId: 'root', childId: 'child' },
      { type: 'parent-child', parentId: 'child', childId: 'root' },
    ];

    expect(getDragGroupPersonIds(relationships, 'root')).toEqual(new Set(['root', 'child']));
  });

  it('snaps the leader to an external neighbor while ignoring its moving group', () => {
    const currentLayout = layout([['root', 0], ['moving-partner', 250], ['external-sibling', 500]], [
      ['root', 'family'],
      ['external-sibling', 'family'],
    ]);
    const result = snapFreeXPosition({
      layout: currentLayout,
      relationships: [
        { type: 'spouse', personAId: 'root', personBId: 'moving-partner' },
      ],
      personId: 'root',
      proposedX: 240,
      excludedPersonIds: new Set(['root', 'moving-partner']),
    });

    expect(result.x).toBe(228);
    expect(result.snappedToPersonId).toBe('external-sibling');
  });

  it('applies the leader delta unchanged to every group member', () => {
    expect(buildDragPreviewPositions(
      new Map([['leader', 100], ['partner', 356], ['child', 220]]),
      'leader',
      164,
    )).toEqual(new Map([['leader', 164], ['partner', 420], ['child', 284]]));
  });

  it('persists a group in one batch and records one undo snapshot', async () => {
    const persistChangedPeople = vi.fn().mockResolvedValue({ error: null });
    const rememberCurrentGraph = vi.fn();
    const applyPeople = vi.fn();
    const people = [
      { id: 'leader', layoutX: 100 },
      { id: 'partner', layoutX: 356 },
      { id: 'outside', layoutX: 900 },
    ];

    const result = await commitFreeXGroupMove({
      people,
      xByPerson: new Map([['leader', 164], ['partner', 420]]),
      persistChangedPeople,
      rememberCurrentGraph,
      applyPeople,
    });

    expect(result.error).toBeNull();
    expect(persistChangedPeople).toHaveBeenCalledTimes(1);
    expect(persistChangedPeople.mock.calls[0][0]).toHaveLength(2);
    expect(rememberCurrentGraph).toHaveBeenCalledTimes(1);
    expect(applyPeople).toHaveBeenCalledTimes(1);
    expect(applyPeople.mock.calls[0][0].find(({ id }) => id === 'outside').layoutX).toBe(900);
  });

  it('does not create undo or optimistic state after a failed batch', async () => {
    const error = new Error('save failed');
    const rememberCurrentGraph = vi.fn();
    const applyPeople = vi.fn();
    const result = await commitFreeXGroupMove({
      people: [{ id: 'leader', layoutX: 100 }],
      xByPerson: new Map([['leader', 164]]),
      persistChangedPeople: vi.fn().mockResolvedValue({ error }),
      rememberCurrentGraph,
      applyPeople,
    });

    expect(result.error).toBe(error);
    expect(rememberCurrentGraph).not.toHaveBeenCalled();
    expect(applyPeople).not.toHaveBeenCalled();
  });
});
