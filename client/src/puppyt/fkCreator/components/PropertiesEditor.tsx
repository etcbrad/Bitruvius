import type { AnatomicalRole, Part } from '../types';
import { ROLES } from '../constants';

interface PropertiesEditorProps {
  part: Part;
  allParts: Part[];
  onUpdate: (prop: keyof Part | 'rotation', value: unknown) => void;
  onUpdateParent: (parentId: number | null) => void;
}

export function PropertiesEditor({ part, allParts, onUpdate, onUpdateParent }: PropertiesEditorProps) {
  return (
    <div className="panel-section">
      <div className="panel-section-title">Part Properties</div>

      <div className="prop-row">
        <label className="prop-label">Label</label>
        <input
          type="text"
          className="prop-input"
          value={part.name}
          onChange={(e) => onUpdate('name', e.target.value)}
          placeholder="part_name"
        />
      </div>

      <div className="prop-row">
        <label className="prop-label">Anatomical Role</label>
        <select className="prop-input" value={part.role} onChange={(e) => onUpdate('role', e.target.value as AnatomicalRole)}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      <div className="prop-row">
        <label className="prop-label">Parent</label>
        <select
          className="prop-input"
          value={part.parent ?? 'null'}
          onChange={(e) => onUpdateParent(e.target.value === 'null' ? null : Number.parseInt(e.target.value, 10))}
        >
          <option value="null">None</option>
          {allParts
            .filter((p) => p.id !== part.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>

      <div className="prop-row">
        <label className="prop-label">Rotation</label>
        <div className="rot-row">
          <input type="range" min="-180" max="180" value={part.rotation} onChange={(e) => onUpdate('rotation', Number(e.target.value))} />
          <span className="rot-val">{part.rotation}°</span>
        </div>
      </div>

      <div className="pivot-legend">
        <span>
          <span className="pivot-dot auto"></span>Auto pivot
        </span>
        <span>
          <span className="pivot-dot fixed"></span>Pinned pivot
        </span>
      </div>
    </div>
  );
}

