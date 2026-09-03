import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLifeYears, getPersonDisplayName } from '../domain/familyGraph';
import { buildFamilyTreeLayout } from './familyTreeLayout';
import {
  getCloseFamilyPath,
  getFamilyBusHighlightSegments,
  routeConnections,
} from './connectionRouter';
import {
  beginPinch,
  clampTreeScale,
  MAX_TREE_SCALE,
  MIN_TREE_SCALE,
  updatePinch,
} from './touchGestures';

function PersonNode({ person, position, selectedId, onSelectPerson, onHoverPerson, unnamedLabel }) {
  const name = getPersonDisplayName(person, unnamedLabel);
  const lifeYears = getLifeYears(person);
  const initials = [person.firstName, person.lastName]
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2) || '?';

  return (
    <button
      type="button"
      className={`treePersonNode ${person.id === selectedId ? 'selected' : ''}`}
      style={{
        width: position.width,
        height: position.height,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onClick={() => onSelectPerson(person.id)}
      onMouseEnter={() => onHoverPerson(person.id)}
      onMouseLeave={() => onHoverPerson(null)}
      onPointerUp={(event) => {
        if (event.pointerType === 'touch') onHoverPerson(person.id);
      }}
      data-person-id={person.id}
      data-full-name={name}
      title={name}
    >
      {person.photoUrl ? <img src={person.photoUrl} alt="" loading="lazy" /> : <span>{initials}</span>}
      <div className="treePersonText">
        <strong>{name}</strong>
        <small>{lifeYears || person.birthPlace || ' '}</small>
      </div>
    </button>
  );
}

function RelationshipLines({ layout, relationships, activePersonId }) {
  const routed = useMemo(
    () => routeConnections(layout, relationships),
    [layout, relationships],
  );
  const closeFamilyPath = useMemo(
    () => activePersonId ? getCloseFamilyPath(layout, activePersonId) : null,
    [activePersonId, layout],
  );
  const hasHighlight = Boolean(
    closeFamilyPath && (closeFamilyPath.familyIds.size || closeFamilyPath.coupleIds.size),
  );
  const bounds = layout.bounds || { left: 0, top: 0, width: layout.width, height: layout.height };
  return (
    <svg
      className={`relationshipLayer ${hasHighlight ? 'hasHighlight' : ''}`}
      style={{ inset: 'auto', left: bounds.left, top: bounds.top }}
      width={bounds.width}
      height={bounds.height}
      viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`}
    >
      {routed.coupleConnections.map((connection) => (
        <path
          key={connection.id}
          className={`coupleLine ${connection.type} ${connection.distant ? 'distant' : ''} ${hasHighlight && closeFamilyPath.coupleIds.has(connection.id) ? 'isHighlighted' : ''}`}
          data-relationship-id={connection.id}
          data-person-a-id={connection.personIds[0]}
          data-person-b-id={connection.personIds[1]}
          data-distant={connection.distant ? 'true' : 'false'}
          data-route-side={connection.routeSide}
          d={connection.path}
        />
      ))}
      {routed.familyConnections.flatMap((connection) => connection.segments.map((segment, index) => {
        const activeChildren = closeFamilyPath?.childIdsByFamily.get(connection.id);
        const allChildrenHighlighted = connection.childAnchors.every(
          ({ childId }) => activeChildren?.has(childId),
        );
        const isHighlighted = hasHighlight
          && closeFamilyPath.familyIds.has(connection.id)
          && (
            segment.role === 'stem' ||
            segment.role === 'branch' ||
            (segment.role === 'bus' && allChildrenHighlighted) ||
            (segment.role === 'child-drop' && activeChildren?.has(segment.childId))
          );
        return (
          <path
            key={`${connection.id}:${index}`}
            className={`familyLine ${isHighlighted ? 'isHighlighted' : ''}`}
            data-family-id={connection.id}
            data-child-id={segment.childId || ''}
            data-line-role={segment.role}
            d={segment.path}
          />
        );
      }))}
      {hasHighlight ? routed.familyConnections.flatMap((connection) =>
        getFamilyBusHighlightSegments(
          connection,
          closeFamilyPath.childIdsByFamily.get(connection.id),
        ).map((segment) => (
          <path
            key={`${connection.id}:highlight:${segment.childId}`}
            className="familyLine familyBusHighlight isHighlighted"
            data-family-id={connection.id}
            data-child-id={segment.childId}
            data-line-role="bus-highlight"
            data-highlight-from-x={segment.fromX}
            data-highlight-to-x={segment.toX}
            d={segment.path}
          />
        ))) : null}
    </svg>
  );
}

export default function FamilyChartView({ people, relationships, selectedId, onSelectPerson }) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(0.96);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState(null);
  const [touchGestureActive, setTouchGestureActive] = useState(false);
  const [hoveredPersonId, setHoveredPersonId] = useState(null);
  const viewportRef = useRef(null);
  const hasInitialFit = useRef(false);
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const touchGestureRef = useRef(null);
  const unnamedLabel = t('person.unnamed');
  const layout = useMemo(
    () => buildFamilyTreeLayout(people, relationships),
    [people, relationships],
  );

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const padding = 36;
    const bounds = layout.bounds || { left: 0, top: 0, width: layout.width, height: layout.height };
    const widthScale = Math.max(MIN_TREE_SCALE, (viewport.clientWidth - padding * 2) / bounds.width);
    const heightScale = Math.max(MIN_TREE_SCALE, (viewport.clientHeight - padding * 2) / bounds.height);
    const nextScale = Math.min(1, widthScale, heightScale);
    const nextOffset = {
      x: (viewport.clientWidth - bounds.width * nextScale) / 2 - bounds.left * nextScale,
      y: (viewport.clientHeight - bounds.height * nextScale) / 2 - bounds.top * nextScale,
    };
    scaleRef.current = nextScale;
    offsetRef.current = nextOffset;
    setScale(nextScale);
    setOffset(nextOffset);
  }, [layout]);

  useEffect(() => {
    if (hasInitialFit.current) return;
    const frame = requestAnimationFrame(() => {
      fitToScreen();
      hasInitialFit.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [fitToScreen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const commitView = (nextScale, nextOffset) => {
      scaleRef.current = nextScale;
      offsetRef.current = nextOffset;
      setScale(nextScale);
      setOffset(nextOffset);
    };
    const beginPan = (touch) => ({
      mode: 'pan',
      identifier: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      offset: offsetRef.current,
    });
    const handleTouchStart = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        setDragState(null);
        setTouchGestureActive(true);
        touchGestureRef.current = beginPinch(
          event.touches,
          viewport.getBoundingClientRect(),
          scaleRef.current,
          offsetRef.current,
        );
        return;
      }
      if (event.touches.length === 1 && !(event.target instanceof Element && event.target.closest('button'))) {
        event.preventDefault();
        setTouchGestureActive(true);
        touchGestureRef.current = beginPan(event.touches[0]);
      }
    };
    const handleTouchMove = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        if (touchGestureRef.current?.mode !== 'pinch') {
          touchGestureRef.current = beginPinch(
            event.touches,
            viewport.getBoundingClientRect(),
            scaleRef.current,
            offsetRef.current,
          );
        }
        const next = updatePinch(
          touchGestureRef.current,
          event.touches,
          viewport.getBoundingClientRect(),
        );
        commitView(next.scale, next.offset);
        return;
      }
      if (event.touches.length === 1 && touchGestureRef.current?.mode === 'pan') {
        event.preventDefault();
        const touch = Array.from(event.touches).find(
          (item) => item.identifier === touchGestureRef.current.identifier,
        ) || event.touches[0];
        commitView(scaleRef.current, {
          x: touchGestureRef.current.offset.x + touch.clientX - touchGestureRef.current.x,
          y: touchGestureRef.current.offset.y + touch.clientY - touchGestureRef.current.y,
        });
      }
    };
    const handleTouchEnd = (event) => {
      if (!touchGestureRef.current) return;
      event.preventDefault();
      if (event.touches.length === 1) {
        touchGestureRef.current = beginPan(event.touches[0]);
        return;
      }
      touchGestureRef.current = null;
      setTouchGestureActive(false);
    };
    const handleTouchCancel = (event) => {
      if (touchGestureRef.current) event.preventDefault();
      touchGestureRef.current = null;
      setTouchGestureActive(false);
    };

    viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd, { passive: false });
    viewport.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
      viewport.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, []);

  const handlePointerDown = (event) => {
    if (event.pointerType === 'touch') {
      if (!event.target.closest('.treePersonNode')) setHoveredPersonId(null);
      return;
    }
    if (event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset });
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === 'touch') return;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setOffset({
      x: dragState.offset.x + event.clientX - dragState.x,
      y: dragState.offset.y + event.clientY - dragState.y,
    });
  };

  const handleWheel = (event) => {
    event.preventDefault();
    setScale((current) => clampTreeScale(current + (event.deltaY > 0 ? -0.05 : 0.05)));
  };

  return (
    <div
      className="customTreeViewport"
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setDragState(null)}
      onPointerCancel={() => setDragState(null)}
      onWheel={handleWheel}
    >
      <div className="treeControls" aria-label="Tree zoom controls">
        <button type="button" onClick={() => setScale((current) => Math.max(MIN_TREE_SCALE, current - 0.08))} aria-label={t('tree.zoomOut')}>
          <Minus size={16} />
        </button>
        <button type="button" onClick={() => setScale((current) => Math.min(MAX_TREE_SCALE, current + 0.08))} aria-label={t('tree.zoomIn')}>
          <Plus size={16} />
        </button>
        <button type="button" onClick={fitToScreen} aria-label={t('tree.fit')} title={t('tree.fit')}>
          <Maximize2 size={16} />
        </button>
      </div>

      <div
        className={`customTreeCanvas ${dragState || touchGestureActive ? 'isInteracting' : ''}`}
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <RelationshipLines
          layout={layout}
          relationships={relationships}
          activePersonId={hoveredPersonId}
        />
        {layout.people.map((person) => (
          layout.positions.has(person.id) && (
            <PersonNode
              key={person.id}
              person={person}
              position={layout.positions.get(person.id)}
              selectedId={selectedId}
              onSelectPerson={onSelectPerson}
              onHoverPerson={setHoveredPersonId}
              unnamedLabel={unnamedLabel}
            />
          )
        ))}
      </div>
    </div>
  );
}
