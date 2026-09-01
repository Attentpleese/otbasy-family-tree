import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLifeYears, getPersonDisplayName } from '../domain/familyGraph';
import {
  buildFamilyTreeLayout,
  cardCenter,
  getChildConnectionGeometry,
} from './familyTreeLayout';

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
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
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

function RelationshipLines({ layout }) {
  return (
    <svg className="relationshipLayer" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      {layout.coupleConnections.map(({ relationship, a, b }) => {
        const start = cardCenter(a);
        const end = cardCenter(b);
        return (
          <line
            key={relationship.id || `${relationship.personAId}-${relationship.personBId}`}
            className={`coupleLine ${relationship.type}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
          />
        );
      })}

      {layout.childConnections.map((connection) => {
        const geometry = getChildConnectionGeometry(connection, layout.positions);
        if (!geometry) return null;
        const { sourceX, sourceY, branchY, childPositions, minBranchX, maxBranchX } = geometry;
        const key = `${connection.parentIds.join('-')}-${connection.childrenIds.join('-')}`;

        return (
          <g key={key}>
            <path className="familyLine" d={`M ${sourceX} ${sourceY} V ${branchY}`} />
            {maxBranchX > minBranchX ? (
              <path className="familyLine" d={`M ${minBranchX} ${branchY} H ${maxBranchX}`} />
            ) : null}
            {childPositions.map((position) => {
              const center = cardCenter(position);
              return <path key={`${key}-${center.x}`} className="familyLine" d={`M ${center.x} ${branchY} V ${position.y}`} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

export default function FamilyChartView({ people, relationships, selectedId, onSelectPerson }) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(0.96);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState(null);
  const layout = useMemo(() => buildFamilyTreeLayout(people, relationships), [people, relationships]);

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
    setScale((current) => Math.min(1.45, Math.max(0.55, current + (event.deltaY > 0 ? -0.05 : 0.05))));
  };

  return (
    <div
      className="customTreeViewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setDragState(null)}
      onPointerCancel={() => setDragState(null)}
      onWheel={handleWheel}
    >
      <div className="treeControls" aria-label="Tree zoom controls">
        <button type="button" onClick={() => setScale((current) => Math.max(0.55, current - 0.08))} aria-label="Zoom out">
          <Minus size={16} />
        </button>
        <button type="button" onClick={() => setScale((current) => Math.min(1.45, current + 0.08))} aria-label="Zoom in">
          <Plus size={16} />
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
        <RelationshipLines layout={layout} />
        {layout.people.map((person) => (
          <PersonNode
            key={person.id}
            person={person}
            position={layout.positions.get(person.id)}
            selectedId={selectedId}
            onSelectPerson={onSelectPerson}
            unnamedLabel={t('person.unnamed')}
          />
        ))}
      </div>
    </div>
  );
}
