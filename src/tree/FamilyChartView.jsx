import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLifeYears, getPersonDisplayName } from '../domain/familyGraph';
import { buildFamilyTreeLayout } from './familyTreeLayout';
import { routeConnections } from './connectionRouter';
import { buildFamilyUnits } from './familyUnits';
import {
  beginPinch,
  clampTreeScale,
  MAX_TREE_SCALE,
  MIN_TREE_SCALE,
  updatePinch,
} from './touchGestures';
import { visibleFamilyGraph } from './visibleFamilyGraph';

function PersonNode({ person, position, selectedId, onSelectPerson, unnamedLabel, childFamilies, collapsedFamilies, onToggleBranch, t }) {
  const name = getPersonDisplayName(person, unnamedLabel);
  const lifeYears = getLifeYears(person);
  const initials = [person.firstName, person.lastName]
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2) || '?';

  const collapsed = childFamilies.some((family) => collapsedFamilies.has(family.id));
  const branchLabel = t(collapsed ? 'tree.expandBranch' : 'tree.collapseBranch', { name });
  return (
    <>
    <button
      type="button"
      className={`treePersonNode ${person.id === selectedId ? 'selected' : ''}`}
      style={{
        width: position.width,
        height: position.height,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onClick={() => onSelectPerson(person.id)}
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
    {childFamilies.length > 0 ? (
      <button
        type="button"
        className="treeBranchToggle"
        data-branch-person-id={person.id}
        style={{ left: position.x + position.width - 22, top: position.y + position.height - 16 }}
        aria-label={branchLabel}
        title={branchLabel}
        aria-expanded={!collapsed}
        onClick={() => onToggleBranch(childFamilies.map((family) => family.id), collapsed)}
      >
        {collapsed ? <Plus size={18} /> : <Minus size={18} />}
      </button>
    ) : null}
    </>
  );
}

function RelationshipLines({ layout, relationships }) {
  const routed = useMemo(
    () => routeConnections(layout, relationships),
    [layout, relationships],
  );
  const bounds = layout.bounds || { left: 0, top: 0, width: layout.width, height: layout.height };
  return (
    <svg
      className="relationshipLayer"
      style={{ inset: 'auto', left: bounds.left, top: bounds.top }}
      width={bounds.width}
      height={bounds.height}
      viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`}
    >
      {routed.coupleConnections.map((connection) => (
        <path
          key={connection.id}
          className={`coupleLine ${connection.type}`}
          d={connection.path}
        />
      ))}
      {routed.familyConnections.flatMap((connection) => connection.paths.map((connectionPath, index) => (
        <path
          key={`${connection.id}:${index}`}
          className="familyLine"
          d={connectionPath}
        />
      )))}
    </svg>
  );
}

export default function FamilyChartView({ people, relationships, selectedId, onSelectPerson }) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(0.96);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState(null);
  const [touchGestureActive, setTouchGestureActive] = useState(false);
  const [collapsedFamilies, setCollapsedFamilies] = useState(() => new Set());
  const viewportRef = useRef(null);
  const hasInitialFit = useRef(false);
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const touchGestureRef = useRef(null);
  const unnamedLabel = t('person.unnamed');
  const fullFamilies = useMemo(() => buildFamilyUnits(people, relationships).familyUnits, [people, relationships]);
  const visibleGraph = useMemo(
    () => visibleFamilyGraph(people, relationships, collapsedFamilies),
    [people, relationships, collapsedFamilies],
  );
  const toggleBranch = (ids, expand) => setCollapsedFamilies((current) => {
    const next = new Set(current);
    ids.forEach((id) => expand ? next.delete(id) : next.add(id));
    return next;
  });
  const layout = useMemo(
    () => buildFamilyTreeLayout(visibleGraph.people, visibleGraph.relationships),
    [visibleGraph],
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
      x: (viewport.clientWidth - bounds.width * nextScale) / 2 - bounds.left * nextScale - 18,
      y: (viewport.clientHeight - bounds.height * nextScale) / 2 - bounds.top * nextScale - 18,
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
    if (event.pointerType === 'touch') return;
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
        <RelationshipLines layout={layout} relationships={visibleGraph.relationships} />
        {layout.people.map((person) => (
          layout.positions.has(person.id) && (
            <PersonNode
              key={person.id}
              person={person}
              position={layout.positions.get(person.id)}
              selectedId={selectedId}
              onSelectPerson={onSelectPerson}
              unnamedLabel={unnamedLabel}
              childFamilies={fullFamilies.filter((family) => family.partners.includes(person.id) && family.children.length)}
              collapsedFamilies={collapsedFamilies}
              onToggleBranch={toggleBranch}
              t={t}
            />
          )
        ))}
      </div>
    </div>
  );
}
