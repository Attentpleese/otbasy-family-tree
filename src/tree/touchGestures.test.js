import { describe, expect, it } from 'vitest';
import {
  beginPinch,
  MAX_TREE_SCALE,
  MIN_TREE_SCALE,
  updatePinch,
  zoomAroundPoint,
} from './touchGestures';

const rect = { left: 20, top: 30 };
const touches = (firstX, secondX, y = 180) => [
  { clientX: firstX, clientY: y },
  { clientX: secondX, clientY: y },
];

describe('touch tree gestures', () => {
  it('zooms around the midpoint between both fingers', () => {
    const start = beginPinch(touches(120, 220), rect, 0.8, { x: 40, y: 20 });
    const next = updatePinch(start, touches(90, 250), rect);
    const midpoint = { x: 150, y: 150 };

    expect(next.scale).toBeCloseTo(1.28, 8);
    expect(next.offset.x + start.contentAnchor.x * next.scale).toBeCloseTo(midpoint.x, 8);
    expect(next.offset.y + start.contentAnchor.y * next.scale).toBeCloseTo(midpoint.y, 8);
  });

  it('combines midpoint movement with pinch pan without losing the content anchor', () => {
    const start = beginPinch(touches(120, 220), rect, 1, { x: 10, y: 15 });
    const next = updatePinch(start, touches(170, 270, 230), rect);
    const movedMidpoint = { x: 200, y: 200 };

    expect(next.offset.x + start.contentAnchor.x * next.scale).toBeCloseTo(movedMidpoint.x, 8);
    expect(next.offset.y + start.contentAnchor.y * next.scale).toBeCloseTo(movedMidpoint.y, 8);
  });

  it('uses the same minimum and maximum scale limits as the other controls', () => {
    const start = beginPinch(touches(120, 220), rect, 1, { x: 0, y: 0 });

    expect(updatePinch(start, touches(169, 171), rect).scale).toBe(MIN_TREE_SCALE);
    expect(updatePinch(start, touches(-100, 500), rect).scale).toBe(MAX_TREE_SCALE);
  });

  it('keeps the wheel cursor anchor fixed while zooming', () => {
    const nextScale = 0.91;
    const nextOffset = zoomAroundPoint(0.96, { x: 0, y: 0 }, { x: 400, y: 300 }, nextScale);

    expect(nextOffset.x).toBeCloseTo(20.8333333333, 8);
    expect(nextOffset.y).toBeCloseTo(15.625, 8);
  });
});
