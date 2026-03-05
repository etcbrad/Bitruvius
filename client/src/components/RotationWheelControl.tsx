import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, X, ChevronDown } from 'lucide-react';
import { WheelPanel } from './WheelPanel';
import { MiniSlider } from './MiniSlider';
import { ControlGroup } from './ControlGroup';
import type { ControlMode, JointMask, HeadMask } from '../engine/types';

export interface MaskInfo {
  id: string;
  type: 'joint' | 'head' | 'standalone';
  src: string | null;
  visible: boolean;
  label: string;
}

export interface PieceInfo {
  id: string;
  label: string;
  hasMask: boolean;
}

type RotationWheelControlProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (newValue: number) => void;
  isDisabled?: boolean;
  className?: string;
  // Enhanced props for integration
  showIntegratedControls?: boolean;
  currentMaskType?: 'joint' | 'head' | 'standalone';
  currentMaskId?: string;
  maskData?: JointMask | HeadMask;
  availableMasks?: MaskInfo[];
  availablePieces?: PieceInfo[];
  currentControlMode?: ControlMode;
  onMaskSelect?: (maskId: string, type: string) => void;
  onPieceSelect?: (pieceId: string) => void;
  onMaskUpdate?: (updates: Partial<JointMask>) => void;
  onControlModeChange?: (mode: ControlMode) => void;
};

const WHEEL_SIZE = 120;
const CENTER = WHEEL_SIZE / 2;
const RADIUS = CENTER - 6;
const CENTER_BUTTON_SIZE = 32;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const CONTROL_MODES: ControlMode[] = ['Cardboard', 'Rubberband', 'IK', 'JointDrag'];
const CONTROL_MODE_LABELS: Record<ControlMode, string> = {
  Cardboard: 'Rigid',
  Rubberband: 'Elastic', 
  IK: 'Root',
  JointDrag: 'Direct'
};

export const RotationWheelControl: React.FC<RotationWheelControlProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  isDisabled = false,
  className = '',
  showIntegratedControls = false,
  currentMaskType = 'joint',
  currentMaskId = '',
  maskData,
  availableMasks = [],
  availablePieces = [],
  currentControlMode = 'Cardboard',
  onMaskSelect,
  onPieceSelect,
  onMaskUpdate,
  onControlModeChange,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartAngle = useRef(0);
  const dragStartValue = useRef(0);
  const wheelCenter = useRef({ x: 0, y: 0 });
  
  // Integrated menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'masks' | 'pose' | 'transform' | 'filters'>('masks');
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});

  const clampValue = useCallback(
    (v: number) => clamp(v, min, max),
    [min, max],
  );

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wheelRef.current?.getBoundingClientRect();
      if (!rect) return;
      wheelCenter.current = { x: rect.left + CENTER, y: rect.top + CENTER };
      dragStartValue.current = value;
      const dx = clientX - wheelCenter.current.x;
      const dy = clientY - wheelCenter.current.y;
      dragStartAngle.current = (Math.atan2(dy, dx) * 180) / Math.PI;
      setDragging(true);
    },
    [value],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isDisabled) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      beginDrag(e.clientX, e.clientY);
    },
    [beginDrag, isDisabled],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || isDisabled) return;
      const dx = e.clientX - wheelCenter.current.x;
      const dy = e.clientY - wheelCenter.current.y;
      const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

      let angleDelta = currentAngle - dragStartAngle.current;
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;

      const next = clampValue(dragStartValue.current + angleDelta);
      onChange(next);
    },
    [clampValue, dragging, isDisabled, onChange],
  );

  const endDrag = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [endDrag, handlePointerMove]);

  const adjustStep = useCallback(
    (dir: -1 | 1) => {
      if (isDisabled) return;
      onChange(clampValue(value + dir * step));
    },
    [clampValue, isDisabled, onChange, step, value],
  );

  // Menu interaction handlers
  const togglePanel = useCallback((panelKey: string) => {
    setExpandedPanels(prev => ({ ...prev, [panelKey]: !prev[panelKey] }));
  }, []);

  const handleCenterButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showIntegratedControls) {
      setMenuOpen(!menuOpen);
    }
  }, [showIntegratedControls, menuOpen]);

  const handleMaskPropUpdate = useCallback((key: keyof JointMask, val: any) => {
    if (onMaskUpdate && maskData) {
      onMaskUpdate({ [key]: val });
    }
  }, [onMaskUpdate, maskData]);

  const indicatorAngle = useMemo(() => {
    const range = max - min;
    if (!range) return 0;
    const normalized = (value - min) / range;
    return normalized * 360;
  }, [max, min, value]);

  const indicator = useMemo(() => {
    const rad = ((indicatorAngle - 90) * Math.PI) / 180;
    return {
      x: CENTER + RADIUS * Math.cos(rad),
      y: CENTER + RADIUS * Math.sin(rad),
    };
  }, [indicatorAngle]);

  // Render integrated menu content
  const renderIntegratedMenu = () => {
    if (!showIntegratedControls || !menuOpen) return null;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-80 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto"
      >
        {/* Tab Navigation */}
        <div className="flex bg-[#222] rounded-t-lg p-1 gap-1">
          {(['masks', 'pose', 'transform', 'filters'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 px-2 rounded text-[10px] font-bold uppercase transition-all ${
                activeTab === tab
                  ? 'bg-white text-black'
                  : 'text-[#666] hover:text-white hover:bg-[#333]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-3">
          {activeTab === 'masks' && (
            <div className="space-y-3">
              <WheelPanel
                title="Pieces & Joints"
                isOpen={expandedPanels.pieces ?? true}
                onToggle={() => togglePanel('pieces')}
              >
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {availablePieces.map((piece) => (
                    <button
                      key={piece.id}
                      onClick={() => onPieceSelect?.(piece.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors ${
                        piece.id === currentMaskId
                          ? 'bg-white/20 text-white'
                          : 'bg-[#222] hover:bg-[#333] text-[#ddd]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{piece.label}</span>
                        {piece.hasMask && (
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </WheelPanel>

              <WheelPanel
                title="Masks"
                isOpen={expandedPanels.masks ?? true}
                onToggle={() => togglePanel('masks')}
              >
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {availableMasks.map((mask) => (
                    <button
                      key={mask.id}
                      onClick={() => onMaskSelect?.(mask.id, mask.type)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors ${
                        mask.id === currentMaskId && mask.type === currentMaskType
                          ? 'bg-white/20 text-white'
                          : 'bg-[#222] hover:bg-[#333] text-[#ddd]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{mask.label}</span>
                        <div className="flex items-center gap-2">
                          {mask.src && (
                            <div className={`w-2 h-2 rounded-full ${
                              mask.visible ? 'bg-green-500' : 'bg-gray-500'
                            }`}></div>
                          )}
                          <span className="text-[8px] text-[#666]">{mask.type}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </WheelPanel>
            </div>
          )}

          {activeTab === 'pose' && (
            <div className="space-y-3">
              <ControlGroup title="Control Mode">
                <div className="grid grid-cols-2 gap-1">
                  {CONTROL_MODES.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onControlModeChange?.(mode)}
                      className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                        currentControlMode === mode
                          ? 'bg-white text-black'
                          : 'bg-[#222] hover:bg-[#333] text-[#666]'
                      }`}
                    >
                      {CONTROL_MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </ControlGroup>
            </div>
          )}

          {activeTab === 'transform' && maskData && (
            <div className="space-y-3">
              <ControlGroup title="Basic Transform">
                <MiniSlider
                  label="Scale"
                  value={maskData.scale || 1}
                  min={0.01}
                  max={20}
                  step={0.01}
                  onChange={(val) => handleMaskPropUpdate('scale', val)}
                  displayValue={`${(maskData.scale || 1).toFixed(2)}×`}
                />
                <MiniSlider
                  label="Opacity"
                  value={maskData.opacity || 1}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(val) => handleMaskPropUpdate('opacity', val)}
                  displayValue={`${Math.round((maskData.opacity || 1) * 100)}%`}
                />
              </ControlGroup>

              <ControlGroup title="Stretch">
                <div className="grid grid-cols-2 gap-2">
                  <MiniSlider
                    label="X"
                    value={maskData.stretchX || 1}
                    min={0.1}
                    max={3}
                    step={0.01}
                    onChange={(val) => handleMaskPropUpdate('stretchX', val)}
                    displayValue={`${(maskData.stretchX || 1).toFixed(1)}×`}
                  />
                  <MiniSlider
                    label="Y"
                    value={maskData.stretchY || 1}
                    min={0.1}
                    max={3}
                    step={0.01}
                    onChange={(val) => handleMaskPropUpdate('stretchY', val)}
                    displayValue={`${(maskData.stretchY || 1).toFixed(1)}×`}
                  />
                </div>
              </ControlGroup>

              <ControlGroup title="Position">
                <div className="grid grid-cols-2 gap-2">
                  <MiniSlider
                    label="X"
                    value={maskData.offsetX || 0}
                    min={-200}
                    max={200}
                    step={1}
                    onChange={(val) => handleMaskPropUpdate('offsetX', val)}
                    displayValue={`${(maskData.offsetX || 0).toFixed(0)}px`}
                  />
                  <MiniSlider
                    label="Y"
                    value={maskData.offsetY || 0}
                    min={-200}
                    max={200}
                    step={1}
                    onChange={(val) => handleMaskPropUpdate('offsetY', val)}
                    displayValue={`${(maskData.offsetY || 0).toFixed(0)}px`}
                  />
                </div>
              </ControlGroup>
            </div>
          )}

          {activeTab === 'filters' && maskData && (
            <div className="space-y-3">
              <ControlGroup title="Blend Mode">
                <select
                  value={maskData.blendMode || 'normal'}
                  onChange={(e) => handleMaskPropUpdate('blendMode', e.target.value)}
                  className="w-full px-2 py-1 bg-[#222] rounded text-[10px] text-[#ddd]"
                >
                  <option value="normal">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                </select>
              </ControlGroup>

              <ControlGroup title="Color Adjustments">
                <MiniSlider
                  label="Brightness"
                  value={maskData.brightness || 1}
                  min={0}
                  max={3}
                  step={0.01}
                  onChange={(val) => handleMaskPropUpdate('brightness', val)}
                />
                <MiniSlider
                  label="Contrast"
                  value={maskData.contrast || 1}
                  min={0}
                  max={3}
                  step={0.01}
                  onChange={(val) => handleMaskPropUpdate('contrast', val)}
                />
                <MiniSlider
                  label="Saturation"
                  value={maskData.saturation || 1}
                  min={0}
                  max={5}
                  step={0.01}
                  onChange={(val) => handleMaskPropUpdate('saturation', val)}
                />
              </ControlGroup>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className={`relative ${showIntegratedControls ? '' : 'flex items-center justify-center gap-2'}`}>
      {!showIntegratedControls && (
        <>
          <button
            type="button"
            onClick={() => adjustStep(-1)}
            className="w-8 h-8 flex items-center justify-center border border-white/20 text-white/70 hover:bg-white/10 transition-colors text-lg font-bold"
            aria-label="Decrement rotation"
            disabled={isDisabled}
          >
            -
          </button>
        </>
      )}

      <div
        ref={wheelRef}
        className={`relative flex items-center justify-center select-none ${
          showIntegratedControls ? '' : 'gap-2'
        }`}
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        onPointerDown={handlePointerDown}
        role="slider"
        aria-label="Rotation"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <svg width={WHEEL_SIZE} height={WHEEL_SIZE} className="absolute inset-0">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#2D2D2D" stroke="#3A3A3A" strokeWidth="1" />
          {dragging && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS - 2}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
          )}
          <circle
            cx={indicator.x}
            cy={indicator.y}
            r="4"
            fill="#E5E7EB"
            stroke="#2D2D2D"
            strokeWidth="1"
            className="pointer-events-none"
          />
        </svg>
        
        {/* Center button for integrated menu */}
        {showIntegratedControls && (
          <button
            type="button"
            onClick={handleCenterButtonClick}
            className="absolute flex items-center justify-center bg-[#444] hover:bg-[#555] rounded-full transition-colors border border-white/20"
            style={{
              width: CENTER_BUTTON_SIZE,
              height: CENTER_BUTTON_SIZE,
              left: CENTER - CENTER_BUTTON_SIZE / 2,
              top: CENTER - CENTER_BUTTON_SIZE / 2,
            }}
            title="Open control menu"
          >
            <Settings size={14} className="text-white" />
          </button>
        )}
        
        <span className={`relative text-white text-lg font-bold tracking-tight pointer-events-none ${
          showIntegratedControls ? 'text-xs' : ''
        }`}>
          {value.toFixed(0)}°
        </span>
        
        {/* Integrated menu */}
        <AnimatePresence>
          {renderIntegratedMenu()}
        </AnimatePresence>
      </div>

      {!showIntegratedControls && (
        <>
          <button
            type="button"
            onClick={() => adjustStep(1)}
            className="w-8 h-8 flex items-center justify-center border border-white/20 text-white/70 hover:bg-white/10 transition-colors text-lg font-bold"
            aria-label="Increment rotation"
            disabled={isDisabled}
          >
            +
          </button>
        </>
      )}
    </div>
  );
};

