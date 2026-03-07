import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CutoutRigBuilder } from '../CutoutRigBuilder';
import type { SheetPalette, SkeletonState } from '../../engine/types';

// Mock dependencies
vi.mock('../../app/sheetParser', () => ({
  segmentSheetFromFile: vi.fn()
}));

const mockSheetPalette: SheetPalette = {
  sheetId: 'test-sheet',
  name: 'Test Sheet',
  dims: { width: 800, height: 600 },
  segments: [
    {
      id: 'segment-1',
      thumbnail: 'data:image/png;base64,test',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      area: 10000
    }
  ],
  selectedSegmentId: null,
  targetSlotId: null,
  previewSrc: 'data:image/png;base64,test'
};

const mockSkeletonState: SkeletonState = {
  joints: {},
  cutoutSlots: {
    head: { 
      id: 'head',
      name: 'Head', 
      attachment: { 
        type: 'bone',
        fromJointId: 'neck_base',
        toJointId: 'head'
      },
      assetId: null,
      visible: true,
      opacity: 1,
      zIndex: 0,
      mode: 'mask' as any,
      scale: 1,
      lengthScale: 1,
      volumePreserve: false,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      anchorX: 0,
      anchorY: 0
    },
    torso: { 
      id: 'torso',
      name: 'Torso', 
      attachment: { 
        type: 'bone',
        fromJointId: 'waist',
        toJointId: 'torso'
      },
      assetId: null,
      visible: true,
      opacity: 1,
      zIndex: 0,
      mode: 'mask' as any,
      scale: 1,
      lengthScale: 1,
      volumePreserve: false,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      anchorX: 0,
      anchorY: 0
    }
  },
  assets: {},
  cutoutRig: {
    linkWaistToTorso: false,
    linkJointsToMasks: false
  },
  physicsRigidity: 0,
  rigidity: 'cardboard',
  // Add missing required properties
  controlMode: 'Cardboard' as any,
  activeRoots: [],
  stretchEnabled: false,
  bendEnabled: false,
  leadEnabled: false,
  hardStop: true,
  snappiness: 1.0,
  mirroring: false,
  balancedNeck: {
    enabled: false,
    clavicleInfluence: 0.7,
    torsoInfluence: 0.3,
    followStrength: 0.8,
    smoothingFactor: 0.15,
    rotationInheritance: {
      enabled: true,
      torsoInfluence: 0.5,
      lagFactor: 0.3
    }
  },
  activeModel: 'bitruvian' as any,
  groundRootTarget: { x: 0, y: 0 },
  timeline: { enabled: false, clip: null, onionSkin: { enabled: false, past: 0, future: 0 } },
  procgen: { 
    enabled: false, 
    mode: 'idle', 
    strength: 0.5, 
    seed: 0, 
    neutralPose: null,
    bake: { cycleFrames: 30, keyframeStep: 2 },
    options: {
      inPlace: false,
      groundingEnabled: false,
      pauseWhileDragging: false,
      groundPlaneY: 0,
      groundPlaneVisible: false
    },
    gait: { enabled: false, frequency: 1.0, amplitude: 0.1, inPlace: false },
    gaitEnabled: {} as any
  }
};

describe('CutoutRigBuilder', () => {
  const mockUpdateSheetPalette = vi.fn();
  const mockAssignSegmentToSlot = vi.fn();
  const mockSetStateWithHistory = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render closed state correctly', () => {
    render(
      <CutoutRigBuilder
        open={false}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    expect(screen.queryByText('Cutout Rig Builder')).not.toBeInTheDocument();
  });

  it('should render open state correctly', () => {
    render(
      <CutoutRigBuilder
        open={true}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    expect(screen.getByText('Cutout Rig Builder')).toBeInTheDocument();
    expect(screen.getByText('Feed a sheet → assets → rigid bones')).toBeInTheDocument();
  });

  it('should handle file upload', async () => {
    const { segmentSheetFromFile } = await import('@/app/sheetParser');
    const mockResult = {
      name: 'test-sheet',
      width: 800,
      height: 600,
      src: 'data:image/png;base64,test',
      segments: mockSheetPalette.segments
    };
    
    (segmentSheetFromFile as any).mockResolvedValue(mockResult);

    render(
      <CutoutRigBuilder
        open={true}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    const fileInput = screen.getByTestId('sheet-file-input') || 
      screen.getByRole('button', { name: /select sheet/i }).nextElementSibling as HTMLInputElement;
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(segmentSheetFromFile).toHaveBeenCalledWith(file, {
        threshold: 160,
        featherRadius: 2,
        edgeTolerance: 20
      });
    });
  });

  it('should handle rig stage clicks and create joints', async () => {
    render(
      <CutoutRigBuilder
        open={true}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    // Navigate to rig step
    const rigStepButton = screen.getByText('03 RIG');
    fireEvent.click(rigStepButton);

    // Click on rig stage to create joint
    const rigStage = screen.queryByTestId('rig-stage') || screen.getByRole('button', { name: /reset/i }).parentElement;
    fireEvent.click(rigStage, { clientX: 200, clientY: 200 });
    
    await waitFor(() => {
      expect(screen.getByText(/Joint 1/)).toBeInTheDocument();
    });
  });

  it('should handle segment drag and drop', async () => {
    render(
      <CutoutRigBuilder
        open={true}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    // Navigate to arrange step
    const arrangeStepButton = screen.getByText('02 ARRANGE');
    fireEvent.click(arrangeStepButton);

    // Find and drag a segment
    const segment = screen.getByText(/Piece 10000/);
    fireEvent.dragStart(segment, { dataTransfer: { setData: vi.fn() } });

    // Find and drop on a slot
    const slot = screen.getByText('Head');
    fireEvent.dragOver(slot);
    fireEvent.drop(slot, { dataTransfer: { getData: vi.fn().mockReturnValue('segment-1') } });

    await waitFor(() => {
      expect(mockAssignSegmentToSlot).toHaveBeenCalledWith(
        mockSheetPalette.segments[0],
        'head'
      );
    });
  });

  it('should handle close button click', () => {
    render(
      <CutoutRigBuilder
        open={true}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    const closeButton = screen.getByLabelText('Close cutout builder');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should handle parameter changes', async () => {
    render(
      <CutoutRigBuilder
        open={true}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    // Test threshold slider
    const thresholdSlider = screen.getByRole('slider', { name: /threshold/i });
    fireEvent.change(thresholdSlider, { target: { value: '200' } });
    
    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
    });

    // Test feather slider
    const featherSlider = screen.getByRole('slider', { name: /feather/i });
    fireEvent.change(featherSlider, { target: { value: '4' } });
    
    await waitFor(() => {
      expect(screen.getByText('4 px')).toBeInTheDocument();
    });
  });

  it('should handle rig reset', async () => {
    render(
      <CutoutRigBuilder
        open={true}
        onClose={mockOnClose}
        sheetPalette={mockSheetPalette}
        updateSheetPalette={mockUpdateSheetPalette}
        assignSegmentToSlot={mockAssignSegmentToSlot}
        setStateWithHistory={mockSetStateWithHistory}
        state={mockSkeletonState}
      />
    );

    // Navigate to rig step
    const rigStepButton = screen.getByText('03 RIG');
    fireEvent.click(rigStepButton);

    // Click reset button
    const resetButton = screen.getByText('Reset');
    fireEvent.click(resetButton);

    // Verify reset state (no joints or bones should be present)
    await waitFor(() => {
      expect(screen.queryByText(/Joint \d+/)).not.toBeInTheDocument();
      expect(screen.getByText('Click to add joints.')).toBeInTheDocument();
    });
  });
});
