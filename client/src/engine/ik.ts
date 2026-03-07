import {
  Vec2,
  IKConstraintDefinition,
  BoneDefinition,
  degreesToRadians,
  radiansToDegrees,
  normalize,
  subtract,
  add,
  scale,
  distance,
  lerp
} from '../../../shared/types/skeleton';
import { FKSolver, BoneTransform } from './fk';

export interface TwoBoneIKResult {
  rootAngle: number;
  midAngle: number;
}

export function solveTwoBoneIK(
  rootPos: Vec2,
  midPos: Vec2,    // current mid-bone world position (used for bend direction hint)
  targetPos: Vec2,
  upperLen: number,
  lowerLen: number,
  bendPositive: boolean,
  mix: number      // 0 = FK, 1 = IK
): TwoBoneIKResult {
  const dx = targetPos.x - rootPos.x;
  const dy = targetPos.y - rootPos.y;
  const dist = Math.hypot(dx, dy);
  const maxReach = upperLen + lowerLen;
  const clampedDist = Math.min(dist, maxReach * 0.9999);

  // Law of cosines: angle at root
  const cosRoot = (upperLen * upperLen + clampedDist * clampedDist - lowerLen * lowerLen)
    / (2 * upperLen * clampedDist);
  const angleToTarget = Math.atan2(dy, dx);
  
  let rootBendOffset = 0;
  if (cosRoot >= -1 && cosRoot <= 1) {
    rootBendOffset = Math.acos(cosRoot);
  }
  
  const sign = bendPositive ? 1 : -1;
  const ikRootAngle = radiansToDegrees(angleToTarget + sign * rootBendOffset);

  const cosMid = (upperLen * upperLen + lowerLen * lowerLen - clampedDist * clampedDist)
    / (2 * upperLen * lowerLen);
  
  let ikMidAngle = 0;
  if (cosMid >= -1 && cosMid <= 1) {
    ikMidAngle = radiansToDegrees(Math.PI - Math.acos(cosMid)) * sign;
  }

  return { rootAngle: ikRootAngle, midAngle: ikMidAngle };
}

export function solveFABRIK(
  joints: Vec2[],       // [root, j1, j2, ..., tip] — world positions
  lengths: number[],    // [root→j1, j1→j2, ..., jN-1→tip]
  target: Vec2,
  maxIterations = 10,
  tolerance = 0.01
): Vec2[] {
  const n = joints.length;
  const result = joints.map(j => ({ ...j }));
  const rootPos = { ...result[0] };

  for (let iter = 0; iter < maxIterations; iter++) {
    // Forward pass: move tip to target
    result[n - 1] = { ...target };
    for (let i = n - 2; i >= 0; i--) {
      const dir = normalize(subtract(result[i], result[i + 1]));
      result[i] = add(result[i + 1], scale(dir, lengths[i]));
    }
    
    // Backward pass: fix root
    result[0] = { ...rootPos };
    for (let i = 1; i < n; i++) {
      const dir = normalize(subtract(result[i], result[i - 1]));
      result[i] = add(result[i - 1], scale(dir, lengths[i - 1]));
    }
    
    // Convergence check
    if (distance(result[n - 1], target) < tolerance) break;
  }
  
  return result;
}

export class IKSolver {
  constructor(
    private fk: FKSolver,
    private constraints: IKConstraintDefinition[],
    private boneDefinitions: Map<string, BoneDefinition>
  ) {}

  applyAll(): void {
    for (const constraint of this.constraints) {
      if (constraint.mix === 0) continue; // Pure FK — skip

      if (constraint.method === "fabrik" || constraint.bones.length > 2) {
        this.applyFABRIK(constraint);
      } else {
        this.applyTwoBone(constraint);
      }
    }
  }

  private applyTwoBone(c: IKConstraintDefinition): void {
    const upperBone = this.fk.getBone(c.bones[0]);
    const lowerBone = this.fk.getBone(c.bones[1]);
    const target = this.fk.getBone(c.target);
    
    const upperDef = this.boneDefinitions.get(c.bones[0]);
    const lowerDef = this.boneDefinitions.get(c.bones[1]);
    
    if (!upperDef || !lowerDef) {
      console.warn(`IK constraint ${c.name}: missing bone definitions`);
      return;
    }

    const upperLen = upperDef.length || 0;
    const lowerLen = lowerDef.length || 0;

    const result = solveTwoBoneIK(
      { x: upperBone.worldX, y: upperBone.worldY },
      { x: lowerBone.worldX, y: lowerBone.worldY },
      { x: target.worldX, y: target.worldY },
      upperLen, 
      lowerLen, 
      c.bendPositive ?? false, 
      c.mix
    );

    // Mix IK result with current FK rotation
    const fkRootRot = upperBone.localRotation;
    const fkMidRot = lowerBone.localRotation;
    
    this.fk.setBoneLocal(c.bones[0], {
      localRotation: lerp(fkRootRot, result.rootAngle, c.mix)
    });
    
    this.fk.setBoneLocal(c.bones[1], {
      localRotation: lerp(fkMidRot, result.midAngle, c.mix)
    });
  }

  private applyFABRIK(c: IKConstraintDefinition): void {
    const joints = c.bones.map(name => {
      const b = this.fk.getBone(name);
      return { x: b.worldX, y: b.worldY };
    });
    
    const lengths = c.bones.map(name => {
      const def = this.boneDefinitions.get(name);
      return def?.length || 0;
    });
    
    const target = this.fk.getBone(c.target);
    if (!target) {
      console.warn(`IK constraint ${c.name}: target bone ${c.target} not found`);
      return;
    }

    const solved = solveFABRIK(
      joints, 
      lengths, 
      { x: target.worldX, y: target.worldY }
    );

    // Convert solved world positions back to local rotations
    for (let i = 0; i < c.bones.length; i++) {
      const worldAngle = Math.atan2(
        solved[i + 1].y - solved[i].y,
        solved[i + 1].x - solved[i].x
      );
      
      let parentWorldRot = 0;
      if (i === 0) {
        const parentBone = this.getParentBone(c.bones[0]);
        parentWorldRot = parentBone ? parentBone.worldRotation : 0;
      } else {
        parentWorldRot = radiansToDegrees(Math.atan2(
          solved[i].y - solved[i - 1].y,
          solved[i].x - solved[i - 1].x
        ));
      }
      
      const localRot = radiansToDegrees(worldAngle) - parentWorldRot;
      const fkRot = this.fk.getBone(c.bones[i]).localRotation;
      
      this.fk.setBoneLocal(c.bones[i], {
        localRotation: lerp(fkRot, localRot, c.mix)
      });
    }
  }

  private getParentBone(boneName: string): BoneTransform | null {
    const boneDef = this.boneDefinitions.get(boneName);
    if (!boneDef?.parent) return null;
    
    try {
      return this.fk.getBone(boneDef.parent);
    } catch {
      return null;
    }
  }

  // Add or remove constraints at runtime
  addConstraint(constraint: IKConstraintDefinition): void {
    this.constraints.push(constraint);
  }

  removeConstraint(name: string): boolean {
    const index = this.constraints.findIndex(c => c.name === name);
    if (index >= 0) {
      this.constraints.splice(index, 1);
      return true;
    }
    return false;
  }

  getConstraints(): IKConstraintDefinition[] {
    return [...this.constraints];
  }

  // Update constraint mix values
  setConstraintMix(name: string, mix: number): boolean {
    const constraint = this.constraints.find(c => c.name === name);
    if (constraint) {
      constraint.mix = Math.max(0, Math.min(1, mix));
      return true;
    }
    return false;
  }
}
