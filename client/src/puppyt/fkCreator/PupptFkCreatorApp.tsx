import { Header } from './components/Header';
import { ModeStrip } from './components/ModeStrip';
import { HarvestControls } from './components/HarvestControls';
import { PropertiesEditor } from './components/PropertiesEditor';
import { PartsList } from './components/PartsList';
import { Viewport } from './components/Viewport';
import { CutMergeTools } from './components/CutMergeTools';
import { useRigging } from './useRigging';

export default function PupptFkCreatorApp() {
  const {
    state,
    selectedPart,
    setMode,
    loadImage,
    clearParts,
    autoHarvest,
    selectPart,
    updatePart,
    updatePartParent,
    startDraggingPivot,
    dragPivot,
    stopDraggingPivot,
    startDraggingPart,
    dragPart,
    stopDraggingPart,
    startCut,
    updateCut,
    cancelCut,
    completeCut,
    toggleMergeSelection,
    mergeSelected,
    exportProject,
  } = useRigging();

  return (
    <div className="bitruvius-app" aria-label="pyxl.puppyt FK creator">
      <Header />

      <div className="app-body">
        <Viewport
          state={state}
          onSelectPart={selectPart}
          onStartDraggingPivot={startDraggingPivot}
          onDragPivot={dragPivot}
          onStopDraggingPivot={stopDraggingPivot}
          onStartDraggingPart={startDraggingPart}
          onDragPart={dragPart}
          onStopDraggingPart={stopDraggingPart}
          onStartCut={startCut}
          onUpdateCut={updateCut}
          onToggleMergeSelection={toggleMergeSelection}
        />

        <div className="panel">
          <ModeStrip mode={state.mode} onModeChange={setMode} />

          <HarvestControls onLoadImage={loadImage} onAutoHarvest={autoHarvest} onClearParts={clearParts} />

          {selectedPart && (
            <PropertiesEditor part={selectedPart} allParts={state.parts} onUpdate={updatePart} onUpdateParent={updatePartParent} />
          )}

          <CutMergeTools
            state={state}
            onCompleteCut={completeCut}
            onCancelCut={() => {
              cancelCut();
              setMode('harvest');
            }}
            onToggleMergeSelection={toggleMergeSelection}
            onMergeSelected={mergeSelected}
          />

          <div className="panel-section panel-section-tight">
            <div className="panel-section-title">
              Parts Manifest (<span>{state.parts.length}</span>)
            </div>
          </div>

          <PartsList parts={state.parts} selectedId={state.selectedId} onSelectPart={(id) => selectPart(id)} />

          <div className="panel-footer">
            <button className="btn export-btn" onClick={exportProject} disabled={state.parts.length === 0}>
              Export .puppt JSON
            </button>
            <div className="status-bar">
              <span className="status-ok">● {state.parts.length > 0 ? `${state.parts.length} PARTS` : 'READY'}</span>
              <span className="status-dim">{state.img ? `${state.img.width}×${state.img.height}` : 'NO IMAGE'}</span>
            </div>
            {state.lastMessage && <div className="toast-lite">{state.lastMessage}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

