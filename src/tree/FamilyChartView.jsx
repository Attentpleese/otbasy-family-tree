import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLifeYears, getPersonDisplayName } from '../domain/familyGraph';
import {
  buildFamilyTreeLayout,
  TREE_CARD_MAX_WIDTH,
  TREE_CARD_MIN_WIDTH,
} from './familyTreeLayout';
import { routeConnections } from './connectionRouter';

function PersonNode({ person, position, selectedId, onSelectPerson, unnamedLabel }) {
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
    >
      {person.photoUrl ? <img src={person.photoUrl} alt="" loading="lazy" /> : <span>{initials}</span>}
      <div className="treePersonText">
        <strong>{name}</strong>
        <small>{lifeYears || person.birthPlace || ' '}</small>
      </div>
    </button>
  );
}

function RelationshipLines({ layout, relationships }) {
  const routed = useMemo(
    () => routeConnections(layout, relationships),
    [layout, relationships],
  );
  return (
    <svg className="relationshipLayer" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
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
  const [nodeWidths, setNodeWidths] = useState(() => new Map());
  const viewportRef = useRef(null);
  const measureRef = useRef(null);
  const unnamedLabel = t('person.unnamed');
  const layout = useMemo(
    () => buildFamilyTreeLayout(people, relationships, { nodeWidths }),
    [people, relationships, nodeWidths],
  );

  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const measured = new Map();
    measureRef.current.querySelectorAll('[data-person-id]').forEach((element) => {
      const contentWidth = element.getBoundingClientRect().width;
      measured.set(
        element.dataset.personId,
        Math.min(TREE_CARD_MAX_WIDTH, Math.max(TREE_CARD_MIN_WIDTH, Math.ceil(contentWidth + 124))),
      );
    });
    setNodeWidths((current) => {
      const unchanged = current.size === measured.size &&
        [...measured].every(([id, width]) => current.get(id) === width);
      return unchanged ? current : measured;
    });
  }, [people, unnamedLabel]);

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const padding = 36;
    const widthScale = Math.max(0.15, (viewport.clientWidth - padding * 2) / layout.width);
    const heightScale = Math.max(0.15, (viewport.clientHeight - padding * 2) / layout.height);
    const nextScale = Math.min(1, widthScale, heightScale);
    setScale(nextScale);
    setOffset({
      x: (viewport.clientWidth - layout.width * nextScale) / 2 - 18,
      y: (viewport.clientHeight - layout.height * nextScale) / 2 - 18,
    });
  }, [layout]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitToScreen);
    const observer = new ResizeObserver(fitToScreen);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitToScreen]);

  const handlePointerDown = (event) => {
    if (event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset });
  };

  const handlePointerMove = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setOffset({
      x: dragState.offset.x + event.clientX - dragState.x,
      y: dragState.offset.y + event.clientY - dragState.y,
    });
  };

  const handleWheel = (event) => {
    event.preventDefault();
    setScale((current) => Math.min(1.45, Math.max(0.15, current + (event.deltaY > 0 ? -0.05 : 0.05))));
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
      <div className="treeMeasureLayer" ref={measureRef} aria-hidden="true">
        {people.map((person) => (
          <strong key={person.id} data-person-id={person.id}>
            {getPersonDisplayName(person, unnamedLabel)}
          </strong>
        ))}
      </div>
      <div className="treeControls" aria-label="Tree zoom controls">
        <button type="button" onClick={() => setScale((current) => Math.max(0.15, current - 0.08))} aria-label={t('tree.zoomOut')}>
          <Minus size={16} />
        </button>
        <button type="button" onClick={() => setScale((current) => Math.min(1.45, current + 0.08))} aria-label={t('tree.zoomIn')}>
          <Plus size={16} />
        </button>
        <button type="button" onClick={fitToScreen} aria-label={t('tree.fit')} title={t('tree.fit')}>
          <Maximize2 size={16} />
        </button>
      </div>

      <div
        className="customTreeCanvas"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <RelationshipLines layout={layout} relationships={relationships} />
        {layout.people.map((person) => (
          layout.positions.has(person.id) && (
            <PersonNode
              key={person.id}
              person={person}
              position={layout.positions.get(person.id)}
              selectedId={selectedId}
              onSelectPerson={onSelectPerson}
              unnamedLabel={unnamedLabel}
            />
          )
        ))}
      </div>
    </div>
  );
}
