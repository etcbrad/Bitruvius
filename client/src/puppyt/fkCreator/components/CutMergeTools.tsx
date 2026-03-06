import type { RiggingState } from '../types';

interface CutMergeToolsProps {
  state: RiggingState;
  onCompleteCut: () => void;
  onCancelCut: () => void;
  onToggleMergeSelection: (partId: number) => void;
  onMergeSelected: () => void;
}

export function CutMergeTools({ state, onCompleteCut, onCancelCut, onToggleMergeSelection, onMergeSelected }: CutMergeToolsProps) {
  const isCutMode = state.mode === 'cut';
  const isMergeMode = state.mode === 'merge';

  if (!isCutMode && !isMergeMode) return null;

  return (
    <div className="panel-section tool-panel">
      <div className="panel-section-title">{isCutMode ? 'Cut Tool' : 'Merge Tool'}</div>

      {isCutMode && (
        <div className="tool-help">
          Click and drag in the viewport to draw a cut line, then press “Complete Cut”.
        </div>
      )}

      {isMergeMode && (
        <div className="tool-help">
          Click parts in the viewport to select them for merging. Selected: {state.mergeSelection.length}
        </div>
      )}

      {isCutMode && (
        <div className="tool-row">
          <button className="btn primary" onClick={onCompleteCut} disabled={!state.cutLine}>
            Complete Cut
          </button>
          <button className="btn" onClick={onCancelCut}>
            Cancel
          </button>
        </div>
      )}

      {isMergeMode && (
        <div className="tool-row">
          <button className="btn primary" onClick={onMergeSelected} disabled={state.mergeSelection.length < 2}>
            Merge Selected ({state.mergeSelection.length})
          </button>
        </div>
      )}

      {isMergeMode && state.parts.length > 0 && (
        <div className="tool-help" style={{ marginTop: '10px' }}>
          Or select parts from the list:
          <div className="merge-pills">
            {state.parts.map((p) => {
              const selected = state.mergeSelection.includes(p.id);
              return (
                <button
                  key={p.id}
                  className={`merge-pill ${selected ? 'selected' : ''}`}
                  onClick={() => onToggleMergeSelection(p.id)}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

