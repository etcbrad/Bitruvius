import { useRef } from 'react';

interface HarvestControlsProps {
  onLoadImage: (file: File) => void;
  onAutoHarvest: () => void;
  onClearParts: () => void;
}

export function HarvestControls({ onLoadImage, onAutoHarvest, onClearParts }: HarvestControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadImage(file);
  };

  return (
    <div className="panel-section">
      <div className="panel-section-title">Sheet Operations</div>
      <button className="btn primary" onClick={() => fileInputRef.current?.click()}>
        Load Image Sheet
      </button>
      <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileChange} />
      <button className="btn" onClick={onAutoHarvest}>
        Auto-Detect Shapes
      </button>
      <button className="btn" onClick={onClearParts}>
        Clear All Parts
      </button>
    </div>
  );
}

