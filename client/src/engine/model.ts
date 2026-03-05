import type { Connection, Joint } from './types';

export const INITIAL_JOINTS: Record<string, Joint> = {
  root: { id: 'root', label: 'Root', parent: null, baseOffset: { x: 0, y: 0 }, currentOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, previewOffset: { x: 0, y: 0 }, rotation: 0 },
  navel: { id: 'navel', label: 'Waist', parent: 'root', baseOffset: { x: 0, y: 0 }, currentOffset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, previewOffset: { x: 0, y: 0 }, rotation: 0 },
  sternum: { id: 'sternum', label: 'Sternum', parent: 'navel', baseOffset: { x: 0, y: -4 }, currentOffset: { x: 0, y: -4 }, targetOffset: { x: 0, y: -4 }, previewOffset: { x: 0, y: -4 }, rotation: 0 },
  collar: { id: 'collar', label: 'Collar', parent: 'sternum', baseOffset: { x: 0, y: -2 }, currentOffset: { x: 0, y: -2 }, targetOffset: { x: 0, y: -2 }, previewOffset: { x: 0, y: -2 }, rotation: 0 },
  neck_base: { id: 'neck_base', label: 'Neck Base', parent: 'collar', baseOffset: { x: 0, y: -1 }, currentOffset: { x: 0, y: -1 }, targetOffset: { x: 0, y: -1 }, previewOffset: { x: 0, y: -1 }, rotation: 0 },
  head: { id: 'head', label: 'Head', parent: 'neck_base', baseOffset: { x: 0, y: -2 }, currentOffset: { x: 0, y: -2 }, targetOffset: { x: 0, y: -2 }, previewOffset: { x: 0, y: -2 }, isEndEffector: true, rotation: 0 },

  l_nipple: { id: 'l_nipple', label: 'L Nipple', parent: 'sternum', baseOffset: { x: -2.5, y: 1.5 }, currentOffset: { x: -2.5, y: 1.5 }, targetOffset: { x: -2.5, y: 1.5 }, previewOffset: { x: -2.5, y: 1.5 }, mirrorId: 'r_nipple', rotation: 0 },
  r_nipple: { id: 'r_nipple', label: 'R Nipple', parent: 'sternum', baseOffset: { x: 2.5, y: 1.5 }, currentOffset: { x: 2.5, y: 1.5 }, targetOffset: { x: 2.5, y: 1.5 }, previewOffset: { x: 2.5, y: 1.5 }, mirrorId: 'l_nipple', rotation: 0 },

  l_clavicle: { id: 'l_clavicle', label: 'L Clavicle', parent: 'collar', baseOffset: { x: -1.5, y: -1.25 }, currentOffset: { x: -1.5, y: -1.25 }, targetOffset: { x: -1.5, y: -1.25 }, previewOffset: { x: -1.5, y: -1.25 }, mirrorId: 'r_clavicle', rotation: 0 },
  l_bicep: { id: 'l_bicep', label: 'L Bicep', parent: 'l_clavicle', baseOffset: { x: -1.5, y: 3.75 }, currentOffset: { x: -1.5, y: 3.75 }, targetOffset: { x: -1.5, y: 3.75 }, previewOffset: { x: -1.5, y: 3.75 }, mirrorId: 'r_bicep', rotation: 0 },
  l_elbow: { id: 'l_elbow', label: 'L Elbow', parent: 'l_bicep', baseOffset: { x: -4, y: 0 }, currentOffset: { x: -4, y: 0 }, targetOffset: { x: -4, y: 0 }, previewOffset: { x: -4, y: 0 }, rotation: 0 },
  l_wrist: { id: 'l_wrist', label: 'L Wrist', parent: 'l_elbow', baseOffset: { x: -4, y: 0 }, currentOffset: { x: -4, y: 0 }, targetOffset: { x: -4, y: 0 }, previewOffset: { x: -4, y: 0 }, isEndEffector: true, mirrorId: 'r_wrist', rotation: 0 },
  l_fingertip: { id: 'l_fingertip', label: 'L Fingertip', parent: 'l_wrist', baseOffset: { x: -1, y: 1 }, currentOffset: { x: -1, y: 1 }, targetOffset: { x: -1, y: 1 }, previewOffset: { x: -1, y: 1 }, mirrorId: 'r_fingertip', rotation: 0 },

  r_clavicle: { id: 'r_clavicle', label: 'R Clavicle', parent: 'collar', baseOffset: { x: 1.5, y: -1.25 }, currentOffset: { x: 1.5, y: -1.25 }, targetOffset: { x: 1.5, y: -1.25 }, previewOffset: { x: 1.5, y: -1.25 }, mirrorId: 'l_clavicle', rotation: 0 },
  r_bicep: { id: 'r_bicep', label: 'R Bicep', parent: 'r_clavicle', baseOffset: { x: 1.5, y: 3.75 }, currentOffset: { x: 1.5, y: 3.75 }, targetOffset: { x: 1.5, y: 3.75 }, previewOffset: { x: 1.5, y: 3.75 }, mirrorId: 'l_bicep', rotation: 0 },
  r_elbow: { id: 'r_elbow', label: 'R Elbow', parent: 'r_bicep', baseOffset: { x: 4, y: 0 }, currentOffset: { x: 4, y: 0 }, targetOffset: { x: 4, y: 0 }, previewOffset: { x: 4, y: 0 }, rotation: 0 },
  r_wrist: { id: 'r_wrist', label: 'R Wrist', parent: 'r_elbow', baseOffset: { x: 4, y: 0 }, currentOffset: { x: 4, y: 0 }, targetOffset: { x: 4, y: 0 }, previewOffset: { x: 4, y: 0 }, isEndEffector: true, mirrorId: 'l_wrist', rotation: 0 },
  r_fingertip: { id: 'r_fingertip', label: 'R Fingertip', parent: 'r_wrist', baseOffset: { x: 1, y: 1 }, currentOffset: { x: 1, y: 1 }, targetOffset: { x: 1, y: 1 }, previewOffset: { x: 1, y: 1 }, mirrorId: 'l_fingertip', rotation: 0 },

  l_hip: { id: 'l_hip', label: 'L Hip', parent: 'navel', baseOffset: { x: -2, y: 1 }, currentOffset: { x: -2, y: 1 }, targetOffset: { x: -2, y: 1 }, previewOffset: { x: -2, y: 1 }, mirrorId: 'r_hip', rotation: 0 },
  l_knee: { id: 'l_knee', label: 'L Knee', parent: 'l_hip', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, rotation: 0 },
  l_ankle: { id: 'l_ankle', label: 'L Ankle', parent: 'l_knee', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, isEndEffector: true, mirrorId: 'r_ankle', rotation: 0 },
  l_toe: { id: 'l_toe', label: 'L Toe', parent: 'l_ankle', baseOffset: { x: 0, y: 2 }, currentOffset: { x: 0, y: 2 }, targetOffset: { x: 0, y: 2 }, previewOffset: { x: 0, y: 2 }, isEndEffector: true, mirrorId: 'r_toe', rotation: 0 },
  
  r_hip: { id: 'r_hip', label: 'R Hip', parent: 'navel', baseOffset: { x: 2, y: 1 }, currentOffset: { x: 2, y: 1 }, targetOffset: { x: 2, y: 1 }, previewOffset: { x: 2, y: 1 }, mirrorId: 'l_hip', rotation: 0 },
  r_knee: { id: 'r_knee', label: 'R Knee', parent: 'r_hip', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, rotation: 0 },
  r_ankle: { id: 'r_ankle', label: 'R Ankle', parent: 'r_knee', baseOffset: { x: 0, y: 6 }, currentOffset: { x: 0, y: 6 }, targetOffset: { x: 0, y: 6 }, previewOffset: { x: 0, y: 6 }, isEndEffector: true, mirrorId: 'l_ankle', rotation: 0 },
  r_toe: { id: 'r_toe', label: 'R Toe', parent: 'r_ankle', baseOffset: { x: 0, y: 2 }, currentOffset: { x: 0, y: 2 }, targetOffset: { x: 0, y: 2 }, previewOffset: { x: 0, y: 2 }, isEndEffector: true, mirrorId: 'l_toe', rotation: 0 },
};

export const CONNECTIONS: Connection[] = [
  { from: "collar", to: "l_clavicle", type: "bone", label: "L_Clavicle", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "l_clavicle", to: "l_bicep", type: "bone", label: "L_Bicep", shape: 'muscle', stretchMode: 'rigid' },
  { from: "l_bicep", to: "l_elbow", type: "bone", label: "L_Humerus", shape: 'muscle', stretchMode: 'rigid' },
  { from: "collar", to: "r_clavicle", type: "bone", label: "R_Clavicle", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "r_clavicle", to: "r_bicep", type: "bone", label: "R_Bicep", shape: 'muscle', stretchMode: 'rigid' },
  { from: "r_bicep", to: "r_elbow", type: "bone", label: "R_Humerus", shape: 'muscle', stretchMode: 'rigid' },
  { from: "l_elbow", to: "l_wrist", type: "bone", label: "L_Radius_Ulna", shape: 'tapered', stretchMode: 'rigid' },
  { from: "r_elbow", to: "r_wrist", type: "bone", label: "R_Radius_Ulna", shape: 'tapered', stretchMode: 'rigid' },
  { from: "l_wrist", to: "l_fingertip", type: "soft_limit", label: "L_Hand", shape: 'wire', stretchMode: 'rigid' },
  { from: "r_wrist", to: "r_fingertip", type: "soft_limit", label: "R_Hand", shape: 'wire', stretchMode: 'rigid' },
  { from: "l_elbow", to: "l_nipple", type: "structural_link", shape: 'wire', stretchMode: 'rigid' },
  { from: "r_elbow", to: "r_nipple", type: "structural_link", shape: 'wire', stretchMode: 'rigid' },
  { from: "l_nipple", to: "navel", type: "structural_link", shape: 'wire', stretchMode: 'rigid' },
  { from: "r_nipple", to: "navel", type: "structural_link", shape: 'wire', stretchMode: 'rigid' },
  { from: "navel", to: "l_hip", type: "bone", label: "L_Pelvic Connect", shape: 'bone', stretchMode: 'rigid' },
  { from: "navel", to: "r_hip", type: "bone", label: "R_Pelvic Connect", shape: 'bone', stretchMode: 'rigid' },
  { from: "l_hip", to: "l_knee", type: "bone", label: "L_Femur", shape: 'muscle', stretchMode: 'rigid' },
  { from: "r_hip", to: "r_knee", type: "bone", label: "R_Femur", shape: 'muscle', stretchMode: 'rigid' },
  { from: "l_knee", to: "l_ankle", type: "bone", label: "L_Tibia", shape: 'tapered', stretchMode: 'rigid' },
  { from: "r_knee", to: "r_ankle", type: "bone", label: "R_Tibia", shape: 'tapered', stretchMode: 'rigid' },
  { from: "l_ankle", to: "l_toe", type: "bone", label: "L_Foot", shape: 'tapered', stretchMode: 'rigid' },
  { from: "r_ankle", to: "r_toe", type: "bone", label: "R_Foot", shape: 'tapered', stretchMode: 'rigid' },
  // Core spine connections
  { from: "navel", to: "sternum", type: "bone", label: "Torso", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "sternum", to: "collar", type: "bone", label: "Collar", shape: 'diamond', stretchMode: 'rigid' },
  { from: "collar", to: "neck_base", type: "bone", label: "Neck", shape: 'cylinder', stretchMode: 'rigid' },
  { from: "neck_base", to: "head", type: "bone", label: "Head", shape: 'cylinder', stretchMode: 'rigid' },
  
  // Wireframe connections for spatial structure (thin green lines)
  // NOTE: These are non-hierarchical braces. They intentionally use a non-"bone" type so the physics solver
  // treats them as soft distance constraints (helping the torso/pelvis behave more like a deformable mass).
  // Hip lock: rendered as a horizontal bone; physics behavior is added as an explicit constraint.
  { from: "l_hip", to: "r_hip", type: "bone", label: "Hip Lock", shape: 'bone', stretchMode: 'rigid' },
  // Collar tendon: visual-only span reference (does not participate in physics constraints).
  { from: "l_clavicle", to: "r_clavicle", type: "tendon", label: "Collar Tendon", shape: 'tendon', stretchMode: 'rigid' },
  // Torso diamond (render-only): clavicles + neck base + sternum.
  { from: "l_clavicle", to: "sternum", type: "bone", label: "Torso Diamond", shape: 'diamond', stretchMode: 'rigid' },
  { from: "r_clavicle", to: "sternum", type: "bone", label: "Torso Diamond", shape: 'diamond', stretchMode: 'rigid' },
  // Note: do not brace into `neck_base` (neck is the intended "drop" hinge).
  { from: "l_upper_arm", to: "r_upper_arm", type: "tendon", label: "Shoulder Tendon", shape: 'tendon', stretchMode: 'rigid' },
  { from: "l_upper_arm", to: "navel", type: "structural_link", label: "L Torso Brace", shape: 'wireframe', stretchMode: 'rigid' },
  { from: "r_upper_arm", to: "navel", type: "structural_link", label: "R Torso Brace", shape: 'wireframe', stretchMode: 'rigid' },
  { from: "l_upper_arm", to: "r_hip", type: "structural_link", label: "Cross Brace", shape: 'wireframe', stretchMode: 'rigid' },
  { from: "r_upper_arm", to: "l_hip", type: "structural_link", label: "Cross Brace", shape: 'wireframe', stretchMode: 'rigid' },
];
