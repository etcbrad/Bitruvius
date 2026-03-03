import type { Point } from '../types';

export type WorldPose = Record<string, Point>;

export type DistanceConstraint = {
  kind: 'distance';
  a: string;
  b: string;
  rest: number;
  compliance: number; // 0 = rigid
};

export type PinConstraint = {
  kind: 'pin';
  id: string;
  target: Point;
  compliance: number; // 0 = hard pin
};

export type AxisSpringConstraint = {
  kind: 'axisSpring';
  id: string;
  axis: 'x' | 'y';
  target: number;
  compliance: number; // 0 = hard
};

export type AxisLimitConstraint = {
  kind: 'axisLimit';
  id: string;
  axis: 'x' | 'y';
  min?: number;
  max?: number;
  compliance: number; // 0 = hard
};

export type HingeLimitConstraint = {
  kind: 'hingeLimit';
  a: string; // parent segment start
  b: string; // hinge joint
  c: string; // child segment end
  minRad: number;
  maxRad: number;
  compliance: number; // 0 = hard
};

export type HingeSoftConstraint = {
  kind: 'hingeSoft';
  a: string;
  b: string;
  c: string;
  restRad: number;
  compliance: number; // 0 = strong bias
};

export type XpbdConstraint =
  | DistanceConstraint
  | PinConstraint
  | AxisSpringConstraint
  | AxisLimitConstraint
  | HingeLimitConstraint
  | HingeSoftConstraint;

export type XpbdConfig = {
  iterations: number;
  dt: number;
  damping: number;
};

export type HingeSignMap = Record<string, number>;
