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

// Pyxl Puppet DragonBones-style skeleton - exact proportions from sprite sheets
export const INITIAL_JOINTS: Record<string, Joint> = {
  // Root - waist as the pivot of all motion
  waist: { id: 'waist', label: 'Waist', parent: null, baseOffset: { x: 0, y: 0 }, currentOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, previewOffset: { x: 0, y: 0 }, rotation: 0 },
  
  // Spine chain - exact bone length from waist to torso
  torso: { id: 'torso', label: 'Torso', parent: 'waist', baseOffset: { x: 0, y: -2.8 }, currentOffset: { x: 0, y: -2.8 }, targetOffset: { x: 0, y: -2.8 }, previewOffset: { x: 0, y: -2.8 }, rotation: 0 },
  
  // Collar - exact bone length from torso to collar
  // Collar has built-in socket holes for shoulder connections
  collar: { id: 'collar', label: 'Collar', parent: 'torso', baseOffset: { x: 0, y: -2.4 }, currentOffset: { x: 0, y: -2.4 }, targetOffset: { x: 0, y: -2.4 }, previewOffset: { x: 0, y: -2.4 }, rotation: 0 },
  
  // Head socket - not a joint, but socket for mask
  // Positioned at exact bone length from collar
  head: { id: 'head', label: 'Head', parent: 'collar', baseOffset: { x: 0, y: -1.8 }, currentOffset: { x: 0, y: -1.8 }, targetOffset: { x: 0, y: -1.8 }, previewOffset: { x: 0, y: -1.8 }, isEndEffector: true, rotation: 0 },
  
  // Left arm chain - exact bone lengths with collar socket holes
  // Bicep attaches to collar's left shoulder socket hole
  bicep_l: { id: 'bicep_l', label: 'L Bicep', parent: 'collar', baseOffset: { x: -2.2, y: 0.1 }, currentOffset: { x: -2.2, y: 0.1 }, targetOffset: { x: -2.2, y: 0.1 }, previewOffset: { x: -2.2, y: 0.1 }, mirrorId: 'bicep_r', rotation: 0 },
  forearm_l: { id: 'forearm_l', label: 'L Forearm', parent: 'bicep_l', baseOffset: { x: -2.5, y: 0 }, currentOffset: { x: -2.5, y: 0 }, targetOffset: { x: -2.5, y: 0 }, previewOffset: { x: -2.5, y: 0 }, mirrorId: 'forearm_r', rotation: 0 },
  hand_l: { id: 'hand_l', label: 'L Hand', parent: 'forearm_l', baseOffset: { x: -2.0, y: 0 }, currentOffset: { x: -2.0, y: 0 }, targetOffset: { x: -2.0, y: 0 }, previewOffset: { x: -2.0, y: 0 }, isEndEffector: true, mirrorId: 'hand_r', rotation: 0 },
  
  // Right arm chain - exact bone lengths with collar socket holes
  // Bicep attaches to collar's right shoulder socket hole
  bicep_r: { id: 'bicep_r', label: 'R Bicep', parent: 'collar', baseOffset: { x: 2.2, y: 0.1 }, currentOffset: { x: 2.2, y: 0.1 }, targetOffset: { x: 2.2, y: 0.1 }, previewOffset: { x: 2.2, y: 0.1 }, mirrorId: 'bicep_l', rotation: 0 },
  forearm_r: { id: 'forearm_r', label: 'R Forearm', parent: 'bicep_r', baseOffset: { x: 2.5, y: 0 }, currentOffset: { x: 2.5, y: 0 }, targetOffset: { x: 2.5, y: 0 }, previewOffset: { x: 2.5, y: 0 }, mirrorId: 'forearm_l', rotation: 0 },
  hand_r: { id: 'hand_r', label: 'R Hand', parent: 'forearm_r', baseOffset: { x: 2.0, y: 0 }, currentOffset: { x: 2.0, y: 0 }, targetOffset: { x: 2.0, y: 0 }, previewOffset: { x: 2.0, y: 0 }, isEndEffector: true, mirrorId: 'hand_l', rotation: 0 },
  
  // Left leg chain - exact bone lengths from sprite sheets
  thigh_l: { id: 'thigh_l', label: 'L Thigh', parent: 'waist', baseOffset: { x: -1.0, y: 0.8 }, currentOffset: { x: -1.0, y: 0.8 }, targetOffset: { x: -1.0, y: 0.8 }, previewOffset: { x: -1.0, y: 0.8 }, mirrorId: 'thigh_r', rotation: 0 },
  shin_l: { id: 'shin_l', label: 'L Shin', parent: 'thigh_l', baseOffset: { x: -4.2, y: 0 }, currentOffset: { x: -4.2, y: 0 }, targetOffset: { x: -4.2, y: 0 }, previewOffset: { x: -4.2, y: 0 }, mirrorId: 'shin_r', rotation: 0 },
  foot_l: { id: 'foot_l', label: 'L Foot', parent: 'shin_l', baseOffset: { x: -3.2, y: 0 }, currentOffset: { x: -3.2, y: 0 }, targetOffset: { x: -3.2, y: 0 }, previewOffset: { x: -3.2, y: 0 }, isEndEffector: true, mirrorId: 'foot_r', rotation: 0 },
  
  // Right leg chain - exact bone lengths from sprite sheets
  thigh_r: { id: 'thigh_r', label: 'R Thigh', parent: 'waist', baseOffset: { x: 1.0, y: 0.8 }, currentOffset: { x: 1.0, y: 0.8 }, targetOffset: { x: 1.0, y: 0.8 }, previewOffset: { x: 1.0, y: 0.8 }, mirrorId: 'thigh_l', rotation: 0 },
  shin_r: { id: 'shin_r', label: 'R Shin', parent: 'thigh_r', baseOffset: { x: 4.2, y: 0 }, currentOffset: { x: 4.2, y: 0 }, targetOffset: { x: 4.2, y: 0 }, previewOffset: { x: 4.2, y: 0 }, mirrorId: 'shin_l', rotation: 0 },
  foot_r: { id: 'foot_r', label: 'R Foot', parent: 'shin_r', baseOffset: { x: 3.2, y: 0 }, currentOffset: { x: 3.2, y: 0 }, targetOffset: { x: 3.2, y: 0 }, previewOffset: { x: 3.2, y: 0 }, isEndEffector: true, mirrorId: 'foot_l', rotation: 0 },
};

export const CONNECTIONS: Connection[] = [
  // Pyxl Puppet DragonBones-style connections - exact proportions from sprite sheets
  // Spine chain - exact bone lengths
  { from: "waist", to: "torso", type: "bone", label: "Spine", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "torso", to: "collar", type: "bone", label: "Upper Chest", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "collar", to: "head", type: "bone", label: "Head Socket", shape: 'trapezoid_inverted', stretchMode: 'rigid' },
  
  // Direct arm connections - collar socket holes → bicep → forearm → hand
  // Collar holes are sockets for shoulder connections
  { from: "collar", to: "bicep_l", type: "bone", label: "L Shoulder Socket", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "bicep_l", to: "forearm_l", type: "bone", label: "L Elbow", shape: 'tapered', stretchMode: 'rigid' },
  { from: "forearm_l", to: "hand_l", type: "bone", label: "L Wrist", shape: 'tapered', stretchMode: 'rigid' },
  
  { from: "collar", to: "bicep_r", type: "bone", label: "R Shoulder Socket", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "bicep_r", to: "forearm_r", type: "bone", label: "R Elbow", shape: 'tapered', stretchMode: 'rigid' },
  { from: "forearm_r", to: "hand_r", type: "bone", label: "R Wrist", shape: 'tapered', stretchMode: 'rigid' },
  
  // Leg connections - exact bone lengths from sprite sheets
  { from: "waist", to: "thigh_l", type: "bone", label: "L Hip", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "thigh_l", to: "shin_l", type: "bone", label: "L Knee", shape: 'tapered', stretchMode: 'rigid' },
  { from: "shin_l", to: "foot_l", type: "bone", label: "L Ankle", shape: 'tapered', stretchMode: 'rigid' },
  
  { from: "waist", to: "thigh_r", type: "bone", label: "R Hip", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "thigh_r", to: "shin_r", type: "bone", label: "R Knee", shape: 'tapered', stretchMode: 'rigid' },
  { from: "shin_r", to: "foot_r", type: "bone", label: "R Ankle", shape: 'tapered', stretchMode: 'rigid' },
];
