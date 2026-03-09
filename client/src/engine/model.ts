import type { Connection, Joint } from './types';

// Current "SlenderBit" model - preserved for backward compatibility
export const SLENDERBIT_JOINTS: Record<string, Joint> = {
  root: { id: 'root', label: 'Root', parent: null, baseOffset: { x: 0, y: 0 }, currentOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, previewOffset: { x: 0, y: 0 }, rotation: 0 },
  waist: { id: 'waist', label: 'Waist', parent: 'root', baseOffset: { x: 0, y: -0.875 }, currentOffset: { x: 0, y: -0.875 }, targetOffset: { x: 0, y: -0.875 }, previewOffset: { x: 0, y: -0.875 }, rotation: 0 },
  navel: { id: 'navel', label: 'Navel', parent: 'waist', baseOffset: { x: 0, y: -0.875 }, currentOffset: { x: 0, y: -0.875 }, targetOffset: { x: 0, y: -0.875 }, previewOffset: { x: 0, y: -0.875 }, rotation: 0 },
  sternum: { id: 'sternum', label: 'Sternum', parent: 'navel', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  mid_torso: { id: 'mid_torso', label: 'Mid Torso', parent: 'sternum', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  upper_torso: { id: 'upper_torso', label: 'Upper Torso', parent: 'mid_torso', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  collar: { id: 'collar', label: 'Collar', parent: 'upper_torso', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  head: { id: 'head', label: 'Head', parent: 'collar', baseOffset: { x: 0, y: -3.5 }, currentOffset: { x: 0, y: -3.5 }, targetOffset: { x: 0, y: -3.5 }, previewOffset: { x: 0, y: -3.5 }, isEndEffector: true, rotation: 0 },
  
  l_clavicle: { id: 'l_clavicle', label: 'L Clavicle', parent: 'collar', baseOffset: { x: -1.25, y: -0.5 }, currentOffset: { x: -1.25, y: -0.5 }, targetOffset: { x: -1.25, y: -0.5 }, previewOffset: { x: -1.25, y: -0.5 }, mirrorId: 'r_clavicle', rotation: 0 },
  l_bicep: { id: 'l_bicep', label: 'L Bicep', parent: 'l_clavicle', baseOffset: { x: -1.5, y: 3.75 }, currentOffset: { x: -1.5, y: 3.75 }, targetOffset: { x: -1.5, y: 3.75 }, previewOffset: { x: -1.5, y: 3.75 }, mirrorId: 'r_bicep', rotation: 0 },
  l_elbow: { id: 'l_elbow', label: 'L Elbow', parent: 'l_bicep', baseOffset: { x: -4, y: 0 }, currentOffset: { x: -4, y: 0 }, targetOffset: { x: -4, y: 0 }, previewOffset: { x: -4, y: 0 }, rotation: 0 },
  l_wrist: { id: 'l_wrist', label: 'L Wrist', parent: 'l_elbow', baseOffset: { x: -4, y: 0 }, currentOffset: { x: -4, y: 0 }, targetOffset: { x: -4, y: 0 }, previewOffset: { x: -4, y: 0 }, isEndEffector: true, mirrorId: 'r_wrist', rotation: 0 },
  l_fingertip: { id: 'l_fingertip', label: 'L Fingertip', parent: 'l_wrist', baseOffset: { x: -1, y: 1 }, currentOffset: { x: -1, y: 1 }, targetOffset: { x: -1, y: 1 }, previewOffset: { x: -1, y: 1 }, mirrorId: 'r_fingertip', rotation: 0 },

  r_clavicle: { id: 'r_clavicle', label: 'R Clavicle', parent: 'collar', baseOffset: { x: 1.25, y: -0.5 }, currentOffset: { x: 1.25, y: -0.5 }, targetOffset: { x: 1.25, y: -0.5 }, previewOffset: { x: 1.25, y: -0.5 }, mirrorId: 'l_clavicle', rotation: 0 },
  r_bicep: { id: 'r_bicep', label: 'R Bicep', parent: 'r_clavicle', baseOffset: { x: 1.5, y: 3.75 }, currentOffset: { x: 1.5, y: 3.75 }, targetOffset: { x: 1.5, y: 3.75 }, previewOffset: { x: 1.5, y: 3.75 }, mirrorId: 'l_bicep', rotation: 0 },
  r_elbow: { id: 'r_elbow', label: 'R Elbow', parent: 'r_bicep', baseOffset: { x: 4, y: 0 }, currentOffset: { x: 4, y: 0 }, targetOffset: { x: 4, y: 0 }, previewOffset: { x: 4, y: 0 }, rotation: 0 },
  r_wrist: { id: 'r_wrist', label: 'R Wrist', parent: 'r_elbow', baseOffset: { x: 4, y: 0 }, currentOffset: { x: 4, y: 0 }, targetOffset: { x: 4, y: 0 }, previewOffset: { x: 4, y: 0 }, isEndEffector: true, mirrorId: 'l_wrist', rotation: 0 },
  r_fingertip: { id: 'r_fingertip', label: 'R Fingertip', parent: 'r_wrist', baseOffset: { x: 1, y: 1 }, currentOffset: { x: 1, y: 1 }, targetOffset: { x: 1, y: 1 }, previewOffset: { x: 1, y: 1 }, mirrorId: 'l_fingertip', rotation: 0 },

  l_thigh: { id: 'l_thigh', label: 'L Hip', parent: 'navel', baseOffset: { x: -2, y: 0 }, currentOffset: { x: -2, y: 0 }, targetOffset: { x: -2, y: 0 }, previewOffset: { x: -2, y: 0 }, mirrorId: 'r_thigh', rotation: 0 },
  l_knee: { id: 'l_knee', label: 'L Knee', parent: 'l_thigh', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, rotation: 0 },
  l_ankle: { id: 'l_ankle', label: 'L Ankle', parent: 'l_knee', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, isEndEffector: true, mirrorId: 'r_ankle', rotation: 0 },
  l_toe: { id: 'l_toe', label: 'L Toe', parent: 'l_ankle', baseOffset: { x: 0, y: 2 }, currentOffset: { x: 0, y: 2 }, targetOffset: { x: 0, y: 2 }, previewOffset: { x: 0, y: 2 }, isEndEffector: true, mirrorId: 'r_toe', rotation: 0 },
  
  r_thigh: { id: 'r_thigh', label: 'R Hip', parent: 'navel', baseOffset: { x: 2, y: 0 }, currentOffset: { x: 2, y: 0 }, targetOffset: { x: 2, y: 0 }, previewOffset: { x: 2, y: 0 }, mirrorId: 'l_thigh', rotation: 0 },
  r_knee: { id: 'r_knee', label: 'R Knee', parent: 'r_thigh', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, rotation: 0 },
  r_ankle: { id: 'r_ankle', label: 'R Ankle', parent: 'r_knee', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, isEndEffector: true, mirrorId: 'l_ankle', rotation: 0 },
  r_toe: { id: 'r_toe', label: 'R Toe', parent: 'r_ankle', baseOffset: { x: 0, y: 2 }, currentOffset: { x: 0, y: 2 }, targetOffset: { x: 0, y: 2 }, previewOffset: { x: 0, y: 2 }, isEndEffector: true, mirrorId: 'l_toe', rotation: 0 },
};

// New default humanoid model with inverted shoulder mechanics
export const INITIAL_JOINTS: Record<string, Joint> = {
  root: { id: 'root', label: 'Root', parent: null, baseOffset: { x: 0, y: 0 }, currentOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, previewOffset: { x: 0, y: 0 }, rotation: 0 },
  waist: { id: 'waist', label: 'Waist', parent: 'root', baseOffset: { x: 0, y: -0.875 }, currentOffset: { x: 0, y: -0.875 }, targetOffset: { x: 0, y: -0.875 }, previewOffset: { x: 0, y: -0.875 }, rotation: 0 },
  navel: { id: 'navel', label: 'Navel', parent: 'waist', baseOffset: { x: 0, y: -0.875 }, currentOffset: { x: 0, y: -0.875 }, targetOffset: { x: 0, y: -0.875 }, previewOffset: { x: 0, y: -0.875 }, rotation: 0 },
  sternum: { id: 'sternum', label: 'Sternum', parent: 'navel', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  mid_torso: { id: 'mid_torso', label: 'Mid Torso', parent: 'sternum', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  upper_torso: { id: 'upper_torso', label: 'Upper Torso', parent: 'mid_torso', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  collar: { id: 'collar', label: 'Collar', parent: 'upper_torso', baseOffset: { x: 0, y: -3.17 }, currentOffset: { x: 0, y: -3.17 }, targetOffset: { x: 0, y: -3.17 }, previewOffset: { x: 0, y: -3.17 }, rotation: 0 },
  head: { id: 'head', label: 'Head', parent: 'collar', baseOffset: { x: 0, y: -3.5 }, currentOffset: { x: 0, y: -3.5 }, targetOffset: { x: 0, y: -3.5 }, previewOffset: { x: 0, y: -3.5 }, isEndEffector: true, rotation: 0 },
    
  l_clavicle: { id: 'l_clavicle', label: 'L Clavicle', parent: 'collar', baseOffset: { x: -1.25, y: -0.5 }, currentOffset: { x: -1.25, y: -0.5 }, targetOffset: { x: -1.25, y: -0.5 }, previewOffset: { x: -1.25, y: -0.5 }, mirrorId: 'r_clavicle', rotation: 0 },
  // Humerus length matches clavicle; remaining reach is allocated to the upper arm.
  l_bicep: { id: 'l_bicep', label: 'L Bicep', parent: 'l_clavicle', baseOffset: { x: -1.841, y: 0.65 }, currentOffset: { x: -1.841, y: 0.65 }, targetOffset: { x: -1.841, y: 0.65 }, previewOffset: { x: -1.841, y: 0.65 }, mirrorId: 'r_bicep', rotation: 0 },
  l_elbow: { id: 'l_elbow', label: 'L Elbow', parent: 'l_bicep', baseOffset: { x: -4.711, y: 0.629 }, currentOffset: { x: -4.711, y: 0.629 }, targetOffset: { x: -4.711, y: 0.629 }, previewOffset: { x: -4.711, y: 0.629 }, rotation: 0 },
  l_wrist: { id: 'l_wrist', label: 'L Wrist', parent: 'l_elbow', baseOffset: { x: -4, y: 0 }, currentOffset: { x: -4, y: 0 }, targetOffset: { x: -4, y: 0 }, previewOffset: { x: -4, y: 0 }, isEndEffector: true, mirrorId: 'r_wrist', rotation: 0 },
  l_fingertip: { id: 'l_fingertip', label: 'L Fingertip', parent: 'l_wrist', baseOffset: { x: -1.5, y: 0 }, currentOffset: { x: -1.5, y: 0 }, targetOffset: { x: -1.5, y: 0 }, previewOffset: { x: -1.5, y: 0 }, mirrorId: 'r_fingertip', rotation: 0 },

  r_clavicle: { id: 'r_clavicle', label: 'R Clavicle', parent: 'collar', baseOffset: { x: 1.25, y: -0.5 }, currentOffset: { x: 1.25, y: -0.5 }, targetOffset: { x: 1.25, y: -0.5 }, previewOffset: { x: 1.25, y: -0.5 }, mirrorId: 'l_clavicle', rotation: 0 },
  // Humerus length matches clavicle; remaining reach is allocated to the upper arm.
  r_bicep: { id: 'r_bicep', label: 'R Bicep', parent: 'r_clavicle', baseOffset: { x: 1.841, y: 0.65 }, currentOffset: { x: 1.841, y: 0.65 }, targetOffset: { x: 1.841, y: 0.65 }, previewOffset: { x: 1.841, y: 0.65 }, mirrorId: 'l_bicep', rotation: 0 },
  r_elbow: { id: 'r_elbow', label: 'R Elbow', parent: 'r_bicep', baseOffset: { x: 4.711, y: 0.629 }, currentOffset: { x: 4.711, y: 0.629 }, targetOffset: { x: 4.711, y: 0.629 }, previewOffset: { x: 4.711, y: 0.629 }, rotation: 0 },
  r_wrist: { id: 'r_wrist', label: 'R Wrist', parent: 'r_elbow', baseOffset: { x: 4, y: 0 }, currentOffset: { x: 4, y: 0 }, targetOffset: { x: 4, y: 0 }, previewOffset: { x: 4, y: 0 }, isEndEffector: true, mirrorId: 'l_wrist', rotation: 0 },
  r_fingertip: { id: 'r_fingertip', label: 'R Fingertip', parent: 'r_wrist', baseOffset: { x: 1.5, y: 0 }, currentOffset: { x: 1.5, y: 0 }, targetOffset: { x: 1.5, y: 0 }, previewOffset: { x: 1.5, y: 0 }, mirrorId: 'l_fingertip', rotation: 0 },

  l_thigh: { id: 'l_thigh', label: 'L Hip', parent: 'navel', baseOffset: { x: -1.5, y: 0 }, currentOffset: { x: -1.5, y: 0 }, targetOffset: { x: -1.5, y: 0 }, previewOffset: { x: -1.5, y: 0 }, mirrorId: 'r_thigh', rotation: 0 },
  l_knee: { id: 'l_knee', label: 'L Knee', parent: 'l_thigh', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, rotation: 0 },
  l_ankle: { id: 'l_ankle', label: 'L Ankle', parent: 'l_knee', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, isEndEffector: true, mirrorId: 'r_ankle', rotation: 0 },
  l_toe: { id: 'l_toe', label: 'L Toe', parent: 'l_ankle', baseOffset: { x: 0, y: 2 }, currentOffset: { x: 0, y: 2 }, targetOffset: { x: 0, y: 2 }, previewOffset: { x: 0, y: 2 }, isEndEffector: true, mirrorId: 'r_toe', rotation: 0 },

  r_thigh: { id: 'r_thigh', label: 'R Hip', parent: 'navel', baseOffset: { x: 1.5, y: 0 }, currentOffset: { x: 1.5, y: 0 }, targetOffset: { x: 1.5, y: 0 }, previewOffset: { x: 1.5, y: 0 }, mirrorId: 'l_thigh', rotation: 0 },
  r_knee: { id: 'r_knee', label: 'R Knee', parent: 'r_thigh', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, rotation: 0 },
  r_ankle: { id: 'r_ankle', label: 'R Ankle', parent: 'r_knee', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, isEndEffector: true, mirrorId: 'l_ankle', rotation: 0 },
  r_toe: { id: 'r_toe', label: 'R Toe', parent: 'r_ankle', baseOffset: { x: 0, y: 2 }, currentOffset: { x: 0, y: 2 }, targetOffset: { x: 0, y: 2 }, previewOffset: { x: 0, y: 2 }, isEndEffector: true, mirrorId: 'l_toe', rotation: 0 },
};

export const CONNECTIONS: Connection[] = [
  // Clean bones-only rig (parent → child), no bracing connectors.
  // Note: `root → waist` is a technical anchor and intentionally omitted.

  // Spine / head
  { from: "waist", to: "navel", type: "bone", label: "Lower Waist", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "navel", to: "sternum", type: "bone", label: "Upper Waist", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "sternum", to: "mid_torso", type: "bone", label: "Lower Torso", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "mid_torso", to: "upper_torso", type: "bone", label: "Mid Torso", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "upper_torso", to: "collar", type: "bone", label: "Upper Torso", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "collar", to: "head", type: "bone", label: "Neck", shape: 'trapezoid_inverted', stretchMode: 'rigid' },

  // Left arm
  { from: "collar", to: "l_clavicle", type: "bone", label: "L_Clavicle", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "l_clavicle", to: "l_bicep", type: "bone", label: "L_Humerus", shape: 'muscle', stretchMode: 'rigid' },
  { from: "l_bicep", to: "l_elbow", type: "bone", label: "L_Upper Arm", shape: 'muscle', stretchMode: 'rigid' },
  { from: "l_elbow", to: "l_wrist", type: "bone", label: "L_Forearm", shape: 'tapered', stretchMode: 'rigid' },
  { from: "l_wrist", to: "l_fingertip", type: "bone", label: "L_Hand", shape: 'tapered', stretchMode: 'rigid' },

  // Right arm
  { from: "collar", to: "r_clavicle", type: "bone", label: "R_Clavicle", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "r_clavicle", to: "r_bicep", type: "bone", label: "R_Humerus", shape: 'muscle', stretchMode: 'rigid' },
  { from: "r_bicep", to: "r_elbow", type: "bone", label: "R_Upper Arm", shape: 'muscle', stretchMode: 'rigid' },
  { from: "r_elbow", to: "r_wrist", type: "bone", label: "R_Forearm", shape: 'tapered', stretchMode: 'rigid' },
  { from: "r_wrist", to: "r_fingertip", type: "bone", label: "R_Hand", shape: 'tapered', stretchMode: 'rigid' },

  // Left leg
  { from: "navel", to: "l_thigh", type: "bone", label: "L_Hip", shape: 'muscle', stretchMode: 'rigid' },
  { from: "l_thigh", to: "l_knee", type: "bone", label: "L_Femur", shape: 'tapered', stretchMode: 'rigid' },
  { from: "l_knee", to: "l_ankle", type: "bone", label: "L_Tibia", shape: 'tapered', stretchMode: 'rigid' },
  { from: "l_ankle", to: "l_toe", type: "bone", label: "L_Foot", shape: 'tapered', stretchMode: 'rigid' },

  // Right leg
  { from: "navel", to: "r_thigh", type: "bone", label: "R_Hip", shape: 'muscle', stretchMode: 'rigid' },
  { from: "r_thigh", to: "r_knee", type: "bone", label: "R_Femur", shape: 'tapered', stretchMode: 'rigid' },
  { from: "r_knee", to: "r_ankle", type: "bone", label: "R_Tibia", shape: 'tapered', stretchMode: 'rigid' },
  { from: "r_ankle", to: "r_toe", type: "bone", label: "R_Foot", shape: 'tapered', stretchMode: 'rigid' },
];
