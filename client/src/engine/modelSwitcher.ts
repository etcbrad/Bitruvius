import { SLENDERBIT_JOINTS, INITIAL_JOINTS } from './model';
import type { SkeletonState, RigModel } from './types';

export const RIG_MODELS: Record<RigModel, { name: string; description: string; joints: Record<string, any> }> = {
  slenderbit: {
    name: 'SlenderBit',
    description: 'Original slender rig with traditional shoulder mechanics',
    joints: INITIAL_JOINTS,
  },
  humanoid: {
    name: 'Humanoid',
    description: 'New humanoid proportions with inverted shoulder mechanics',
    joints: INITIAL_JOINTS,
  },
};

export const switchModel = (state: SkeletonState, targetModel: RigModel): SkeletonState => {
  if (state.activeModel === targetModel) return state;

  const targetJoints = RIG_MODELS[targetModel].joints;
  
  // Preserve current joint positions where possible, but use the new model's structure
  const updatedJoints: Record<string, any> = {};
  
  for (const [jointId, targetJoint] of Object.entries(targetJoints)) {
    const currentJoint = state.joints[jointId];
    
    if (currentJoint) {
      // Preserve current offsets but use new model's base structure
      updatedJoints[jointId] = {
        ...targetJoint,
        currentOffset: currentJoint.currentOffset,
        targetOffset: currentJoint.targetOffset,
        previewOffset: currentJoint.previewOffset,
        rotation: currentJoint.rotation ?? 0,
      };
    } else {
      // New joint that doesn't exist in current model
      updatedJoints[jointId] = structuredClone(targetJoint);
    }
  }

  return {
    ...state,
    activeModel: targetModel,
    joints: updatedJoints,
  };
};

export const getModelInfo = (model: RigModel) => RIG_MODELS[model];
