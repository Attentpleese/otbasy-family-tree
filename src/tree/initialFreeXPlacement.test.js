import { describe, expect, it } from 'vitest';
import {
  getInitialChildX,
  getInitialIndependentX,
  getInitialNewPartnerAndChildX,
  getInitialParentPairX,
  getInitialParentX,
  getInitialSiblingX,
  getInitialSpouseX,
} from './initialFreeXPlacement';

const card = (x) => ({ x, y: 56, width: 232, height: 112 });
const layout = (positions, generations = {}) => ({
  positions: new Map(Object.entries(positions).map(([id, x]) => [id, card(x)])),
  generations: new Map(Object.keys(positions).map((id) => [id, generations[id] ?? 0])),
});

describe('initial free X placement', () => {
  it('places a spouse 256px away on the less occupied side', () => {
    const current = layout({ selected: 400, occupied: 656 });
    expect(getInitialSpouseX(current, 'selected')).toBe(144);
  });

  it('centers the first child between both parents', () => {
    const current = layout({ mother: 100, father: 356 }, { mother: 0, father: 0 });
    expect(getInitialChildX(current, ['mother', 'father'])).toBe(228);
  });

  it('uses the nearest free sibling slot around the family center for another child', () => {
    const current = layout(
      { mother: 100, father: 356, existingChild: 228 },
      { mother: 0, father: 0, existingChild: 1 },
    );
    expect(getInitialChildX(current, ['mother', 'father'])).toBe(500);
  });

  it('places a sibling in the nearest free 272px slot', () => {
    const current = layout({ selected: 272, left: 0 });
    expect(getInitialSiblingX(current, 'selected')).toBe(544);
  });

  it('keeps a new parent pair symmetric above the child', () => {
    expect(getInitialParentPairX(layout({ child: 400 }), 'child'))
      .toEqual({ fatherX: 272, motherX: 528 });
  });

  it('centers a lone parent above the child and joins a second parent to the first', () => {
    const current = layout({ child: 400, existingParent: 400 }, { child: 1, existingParent: 0 });
    expect(getInitialParentX(current, 'child')).toBe(400);
    expect(getInitialParentX(current, 'child', ['existingParent'])).toBe(656);
  });

  it('places an independent person to the right of its generation', () => {
    expect(getInitialIndependentX(layout({ left: -100, right: 500 }))).toBe(756);
  });

  it('places a new partner beside the selected person and centers their child', () => {
    expect(getInitialNewPartnerAndChildX(layout({ selected: 400 }), 'selected'))
      .toEqual({ partnerX: 656, childX: 528 });
  });
});
