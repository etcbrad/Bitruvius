import type { CutoutSlot } from './types';
import { INITIAL_JOINTS } from './model';

// Default bone slots based on human rig topology
export const createDefaultCutoutSlots = (): Record<string, CutoutSlot> => {
  const slots: Record<string, CutoutSlot> = {};

  // Helper function to create a slot
  const createSlot = (
    id: string, 
    name: string, 
    fromJointId: string, 
    toJointId: string,
    zIndex: number = 50
  ): CutoutSlot => ({
    id,
    name,
    attachment: {
      type: 'bone',
      fromJointId,
      toJointId,
    },
    assetId: null,
    visible: false,
    opacity: 1.0,
    zIndex,
    mode: 'cutout',
    scale: 1.0,
    lengthScale: 1.0,
    volumePreserve: false,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
  });

  // Spine slots
  slots['spine_upper'] = createSlot('spine_upper', 'Upper Spine', 'sternum', 'collar', 20);
  slots['spine_neck'] = createSlot('spine_neck', 'Neck', 'collar', 'neck_base', 25);
  slots['head'] = createSlot('head', 'Head', 'neck_base', 'head', 100);

  // Left arm slots
  slots['l_upper_arm'] = createSlot('l_upper_arm', 'L Upper Arm', 'l_shoulder', 'l_elbow', 40);
  slots['l_forearm'] = createSlot('l_forearm', 'L Forearm', 'l_elbow', 'l_wrist', 35);
  slots['l_hand'] = createSlot('l_hand', 'L Hand', 'l_wrist', 'l_fingertip', 30);

  // Right arm slots
  slots['r_upper_arm'] = createSlot('r_upper_arm', 'R Upper Arm', 'r_shoulder', 'r_elbow', 40);
  slots['r_forearm'] = createSlot('r_forearm', 'R Forearm', 'r_elbow', 'r_wrist', 35);
  slots['r_hand'] = createSlot('r_hand', 'R Hand', 'r_wrist', 'r_fingertip', 30);

  // Left leg slots
  slots['l_thigh'] = createSlot('l_thigh', 'L Thigh', 'l_hip', 'l_knee', 45);
  slots['l_calf'] = createSlot('l_calf', 'L Calf', 'l_knee', 'l_ankle', 40);
  slots['l_foot'] = createSlot('l_foot', 'L Foot', 'l_ankle', 'l_toe', 10);

  // Right leg slots
  slots['r_thigh'] = createSlot('r_thigh', 'R Thigh', 'r_hip', 'r_knee', 45);
  slots['r_calf'] = createSlot('r_calf', 'R Calf', 'r_knee', 'r_ankle', 40);
  slots['r_foot'] = createSlot('r_foot', 'R Foot', 'r_ankle', 'r_toe', 10);

  // Torso slots
  slots['torso'] = createSlot('torso', 'Torso', 'navel', 'sternum', 50);
  slots['pelvis'] = createSlot('pelvis', 'Pelvis', 'navel', 'navel', 15); // Pelvis is centered on navel

  return slots;
};

// Helper function to get bone slot candidates from PARENT_MAP
export const getBoneSlotCandidates = (): Array<{ id: string; name: string; fromJointId: string; toJointId: string }> => {
  const candidates: Array<{ id: string; name: string; fromJointId: string; toJointId: string }> = [];
  
  // Create slots based on INITIAL_JOINTS parent relationships
  for (const [jointId, joint] of Object.entries(INITIAL_JOINTS)) {
    if (joint.parent && INITIAL_JOINTS[joint.parent]) {
      candidates.push({
        id: jointId,
        name: jointId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        fromJointId: joint.parent,
        toJointId: jointId,
      });
    }
  }
  
  return candidates;
};
