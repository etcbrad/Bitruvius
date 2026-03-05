import React from 'react';

export interface MiniSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  displayValue?: string;
  className?: string;
  disabled?: boolean;
}

export const MiniSlider: React.FC<MiniSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  displayValue,
  className = '',
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  // Compute safe percentage to prevent NaN when max === min
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const clampedPct = Math.max(0, Math.min(100, pct));

  return (
    <div className={`mini-slider ${className}`}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9px] text-[#666] uppercase tracking-wider">{label}</span>
        <span className="text-[9px] text-[#888] font-mono">
          {displayValue || value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-white disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, #ffffff 0%, #ffffff ${clampedPct}%, #333 ${clampedPct}%, #333 100%)`
        }}
      />
    </div>
  );
};
