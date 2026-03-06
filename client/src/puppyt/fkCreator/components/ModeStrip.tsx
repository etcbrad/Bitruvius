import type { Mode } from '../types';

interface ModeStripProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

export function ModeStrip({ mode, onModeChange }: ModeStripProps) {
  return (
    <div className="panel-section">
      <div className="panel-section-title">Operating Mode</div>
      <div className="mode-strip">
        <button className={`mode-btn ${mode === 'harvest' ? 'active' : ''}`} onClick={() => onModeChange('harvest')}>
          <span className="num">I</span>
          Harvest
        </button>
        <button className={`mode-btn ${mode === 'rig' ? 'active' : ''}`} onClick={() => onModeChange('rig')}>
          <span className="num">II</span>
          Rig
        </button>
        <button className={`mode-btn ${mode === 'pose' ? 'active' : ''}`} onClick={() => onModeChange('pose')}>
          <span className="num">III</span>
          Pose
        </button>
      </div>
      <div className="mode-strip secondary">
        <button className={`mode-btn ${mode === 'cut' ? 'active' : ''}`} onClick={() => onModeChange('cut')}>
          Cut
        </button>
        <button className={`mode-btn ${mode === 'merge' ? 'active' : ''}`} onClick={() => onModeChange('merge')}>
          Merge
        </button>
      </div>
    </div>
  );
}

