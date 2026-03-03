export type RigTrack = 'body' | 'arms';
export type RigSide = 'front' | 'back'; // front=right, back=left
export type RigStage = 'joint' | 'bone' | 'mask';

export type RigFocus = {
  track: RigTrack;
  index: number;
  side: RigSide;
  stage: RigStage;
};

