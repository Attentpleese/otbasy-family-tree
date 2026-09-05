import { routeConnections } from './connectionRouter';
import { buildGenerationLayout } from './generationEngine';
import { cardCenter } from './treeGeometry';

const BOUNDS_PADDING_X = 72;
const BOUNDS_PADDING_Y = 56;

const calculateFreeXBounds = (layout, relationships) => {
  const xCoordinates = [];
  const yCoordinates = [];
  layout.positions.forEach((position) => {
    xCoordinates.push(position.x, position.x + position.width);
    yCoordinates.push(position.y, position.y + position.height);
  });

  const routed = routeConnections(layout, relationships);
  routed.coupleConnections.forEach((connection) => {
    connection.personIds.forEach((personId) => {
      const position = layout.positions.get(personId);
      if (!position) return;
      const center = cardCenter(position);
      xCoordinates.push(center.x);
      yCoordinates.push(position.y, center.y, position.y + position.height);
    });
    if (Number.isFinite(connection.channelY)) yCoordinates.push(connection.channelY);
  });
  routed.familyConnections.forEach((connection) => {
    xCoordinates.push(connection.sourceX, ...connection.childAnchors.map(({ x }) => x));
    yCoordinates.push(
      connection.sourceY,
      connection.busY,
      ...connection.childAnchors.map(({ y }) => y),
    );
  });

  if (!xCoordinates.length || !yCoordinates.length) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const left = Math.min(...xCoordinates) - BOUNDS_PADDING_X;
  const right = Math.max(...xCoordinates) + BOUNDS_PADDING_X;
  const top = Math.min(...yCoordinates) - BOUNDS_PADDING_Y;
  const bottom = Math.max(...yCoordinates) + BOUNDS_PADDING_Y;
  return { left, top, width: right - left, height: bottom - top };
};

export function buildFreeXTreeLayout(people, relationships) {
  const generationLayout = buildGenerationLayout(people, relationships);
  const positions = new Map();
  const persistedPositionIds = new Set();

  people.forEach((person) => {
    const generatedPosition = generationLayout.positions.get(person.id);
    if (!generatedPosition) return;
    const hasPersistedX = Number.isFinite(person.layoutX);
    if (hasPersistedX) persistedPositionIds.add(person.id);
    positions.set(person.id, {
      ...generatedPosition,
      x: hasPersistedX ? person.layoutX : generatedPosition.x,
    });
  });

  const provisionalLayout = {
    ...generationLayout,
    positions,
    layoutMode: 'free-x',
    persistedPositionIds,
  };
  const bounds = calculateFreeXBounds(provisionalLayout, relationships);

  return {
    ...provisionalLayout,
    bounds,
    width: bounds.width,
    height: bounds.height,
  };
}

export function previewFreeXPositions(layout, relationships, xByPerson) {
  const positions = new Map(layout.positions);
  let changed = false;
  xByPerson.forEach((x, personId) => {
    const current = positions.get(personId);
    if (!current || !Number.isFinite(x)) return;
    positions.set(personId, { ...current, x });
    changed = true;
  });
  if (!changed) return layout;
  const preview = { ...layout, positions };
  const bounds = calculateFreeXBounds(preview, relationships);
  return { ...preview, bounds, width: bounds.width, height: bounds.height };
}

export function previewFreeXPosition(layout, relationships, personId, x) {
  return previewFreeXPositions(layout, relationships, new Map([[personId, x]]));
}
