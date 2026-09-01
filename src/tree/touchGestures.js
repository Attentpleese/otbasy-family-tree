export const MIN_TREE_SCALE = 0.15;
export const MAX_TREE_SCALE = 1.45;

export const clampTreeScale = (value) => Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, value));

const pointInViewport = (touch, viewportRect) => ({
  x: touch.clientX - viewportRect.left,
  y: touch.clientY - viewportRect.top,
});

export const getPinchMetrics = (touches, viewportRect) => {
  const first = pointInViewport(touches[0], viewportRect);
  const second = pointInViewport(touches[1], viewportRect);
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
  };
};

export const beginPinch = (touches, viewportRect, scale, offset) => {
  const metrics = getPinchMetrics(touches, viewportRect);
  return {
    mode: 'pinch',
    initialDistance: Math.max(1, metrics.distance),
    initialScale: scale,
    contentAnchor: {
      x: (metrics.midpoint.x - offset.x) / scale,
      y: (metrics.midpoint.y - offset.y) / scale,
    },
  };
};

export const updatePinch = (gesture, touches, viewportRect) => {
  const metrics = getPinchMetrics(touches, viewportRect);
  const scale = clampTreeScale(
    gesture.initialScale * (metrics.distance / gesture.initialDistance),
  );
  return {
    scale,
    offset: {
      x: metrics.midpoint.x - gesture.contentAnchor.x * scale,
      y: metrics.midpoint.y - gesture.contentAnchor.y * scale,
    },
  };
};
