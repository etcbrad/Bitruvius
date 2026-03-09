export const MANIKIN_SLOT_ORDER = [
  'head',
  'collar',
  'torso',
  'l_thigh',
  'l_calf',
  'l_foot',
  'r_thigh',
  'r_calf',
  'r_foot',
  'l_upper_arm',
  'l_forearm',
  'l_hand',
  'r_upper_arm',
  'r_forearm',
  'r_hand',
  'waist',
] as const;

export type ManikinSlotId = typeof MANIKIN_SLOT_ORDER[number];
