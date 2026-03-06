import type { Part } from '../types';

interface PartsListProps {
  parts: Part[];
  selectedId: number | null;
  onSelectPart: (id: number) => void;
}

export function PartsList({ parts, selectedId, onSelectPart }: PartsListProps) {
  if (parts.length === 0) {
    return (
      <div className="parts-scroll">
        <div className="empty-state">
          <em>Awaiting Sheet</em>
          Load an image to begin
          <br />
          harvesting parts.
        </div>
      </div>
    );
  }

  return (
    <div className="parts-scroll">
      {parts.map((part) => {
        const parent = part.parent ? parts.find((p) => p.id === part.parent) : null;
        return (
          <div key={part.id} className={`part-card ${selectedId === part.id ? 'selected' : ''}`} onClick={() => onSelectPart(part.id)}>
            <div className="part-name">{part.name}</div>
            <div className="part-meta">
              <span className="role-tag">{part.role}</span>
              {parent && (
                <>
                  {' → '}
                  <span className="parent-tag">{parent.name}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

