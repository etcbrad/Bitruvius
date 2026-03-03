import { IdleSettings, WalkingEnginePose } from './types';
import { lerp, clamp } from './kinematics';
import { BITRUVIAN_CONSTANTS } from './types';
import type { Rng } from '../rng';

export type IdleRuntimeState = {
  gazeTargetX: number;
  gazeTargetY: number;
  lastGazeShiftTime: number;
  currentGazeX: number;
  currentGazeY: number;
  fidgetTargetNeck: number;
  fidgetTargetHand: number;
  lastFidgetShiftTime: number;
  currentFidgetNeck: number;
  currentFidgetHand: number;
  heavyBreathingIntensityInternal: number;
  tremorTarget: number;
  currentTremor: number;
  lastTremorUpdateTime: number;
};

export const createIdleRuntimeState = (): IdleRuntimeState => ({
  gazeTargetX: 0,
  gazeTargetY: 0,
  lastGazeShiftTime: 0,
  currentGazeX: 0,
  currentGazeY: 0,
  fidgetTargetNeck: 0,
  fidgetTargetHand: 0,
  lastFidgetShiftTime: 0,
  currentFidgetNeck: 0,
  currentFidgetHand: 0,
  heavyBreathingIntensityInternal: 0,
  tremorTarget: 0,
  currentTremor: 0,
  lastTremorUpdateTime: 0,
});

export const updateIdlePhysics = (
  time: number,
  deltaTime: number,
  settings: IdleSettings,
  locomotionWeight: number,
  state: IdleRuntimeState,
  rng: Rng,
): Partial<WalkingEnginePose> => {
  const t = time;
  const dampenedSpeed = Math.pow(settings.transitionSpeed, 1 + BITRUVIAN_CONSTANTS.IDLE_PHYSICS.MAX_SPEED_DAMPENING_FACTOR);
  const idleSpeed = lerp(0.05, 0.5, dampenedSpeed);

  // Enhanced heavy breathing system
  if (locomotionWeight > 0.9) {
    state.heavyBreathingIntensityInternal = Math.min(1, state.heavyBreathingIntensityInternal + deltaTime * 0.001);
  } else {
    state.heavyBreathingIntensityInternal = Math.max(0, state.heavyBreathingIntensityInternal - deltaTime * 0.0005);
  }
  const effectiveHeavyBreathing = state.heavyBreathingIntensityInternal;

  // Sophisticated breathing dynamics
  const breathPhase = t * (BITRUVIAN_CONSTANTS.IDLE_PHYSICS.BREATH_SPEED_BASE + settings.breathing * BITRUVIAN_CONSTANTS.IDLE_PHYSICS.BREATH_SPEED_FACTOR) * idleSpeed;
  const breathVal = Math.sin(breathPhase);
  const torsoBreathAmp = BITRUVIAN_CONSTANTS.IDLE_PHYSICS.TORSO_BREATH_AMPLITUDE * (1 + effectiveHeavyBreathing * 2.0);
  const collarBreathAmp = BITRUVIAN_CONSTANTS.IDLE_PHYSICS.COLLAR_BREATH_AMPLITUDE * (1 + effectiveHeavyBreathing * 1.2);

  // Enhanced weight shifting and swaying
  const swayPhase = t * (BITRUVIAN_CONSTANTS.IDLE_PHYSICS.SWAY_SPEED_BASE + settings.weightShift * BITRUVIAN_CONSTANTS.IDLE_PHYSICS.SWAY_SPEED_FACTOR) * idleSpeed;
  const swayVal = Math.sin(swayPhase + 0.4); 
  
  // Sophisticated posture system
  const posture = settings.posture;
  const torsoBias = posture < 0 ? posture * -15 : posture * -8;
  const collarBias = posture < 0 ? posture * -10 : posture * -8;
  const neckBias = posture < 0 ? posture * -10 : posture * -8;

  // Enhanced tension and tremor system
  const tension = settings.tension;
  let tremor = 0;
  if (tension > 0.01) {
    if (t - state.lastTremorUpdateTime > (250 + rng.next() * 250) / idleSpeed) {
      state.tremorTarget = (rng.next() * 2 - 1) * 0.8;
      state.lastTremorUpdateTime = t;
    }
    state.currentTremor = lerp(state.currentTremor, state.tremorTarget, 0.1);
    tremor = state.currentTremor * tension;
  }
  
  const collarHunchYOffset = -tension * 0.06; 
  const shoulderHunchRotation = tension * 6;

  // Enhanced gaze system with realistic timing
  const gazeShiftInterval = (4000 + rng.next() * 4000) / idleSpeed;
  if (t - state.lastGazeShiftTime > gazeShiftInterval * (1.5 - settings.gazeSway)) {
    state.gazeTargetX = (rng.next() * 2 - 1) * 6 * settings.gazeSway;
    state.gazeTargetY = (rng.next() * 2 - 1) * 4 * settings.gazeSway;
    state.lastGazeShiftTime = t;
  }
  const gazeProgress = clamp((t - state.lastGazeShiftTime) / (800 / idleSpeed), 0, 1);
  state.currentGazeX = lerp(state.currentGazeX, settings.gazeSway > 0.01 ? state.gazeTargetX : 0, gazeProgress);
  state.currentGazeY = lerp(state.currentGazeY, settings.gazeSway > 0.01 ? state.gazeTargetY : 0, gazeProgress);

  // Enhanced fidgeting system
  const fidgetInterval = (6000 + rng.next() * 6000) / idleSpeed;
  if (t - state.lastFidgetShiftTime > fidgetInterval * (1.5 - settings.fidgetFrequency)) {
    state.fidgetTargetNeck = (rng.next() * 2 - 1) * 2 * settings.fidgetFrequency;
    state.fidgetTargetHand = (rng.next() * 2 - 1) * 1 * settings.fidgetFrequency;
    state.lastFidgetShiftTime = t;
  }
  const fidgetProgress = Math.min(1, (t - state.lastFidgetShiftTime) / (1000 / idleSpeed));
  state.currentFidgetNeck = lerp(
    state.currentFidgetNeck,
    settings.fidgetFrequency > 0.01 ? state.fidgetTargetNeck : 0,
    fidgetProgress,
  );
  state.currentFidgetHand = lerp(
    state.currentFidgetHand,
    settings.fidgetFrequency > 0.01 ? state.fidgetTargetHand : 0,
    fidgetProgress,
  );

  return {
    torso: torsoBias + breathVal * torsoBreathAmp + swayVal * 2,
    collar: collarBias + breathVal * collarBreathAmp + tremor + state.currentGazeY,
    collarYOffset: collarHunchYOffset, 
    neck: neckBias + state.currentGazeX + state.currentFidgetNeck,
    l_shoulder: 8 * tension + shoulderHunchRotation,
    r_shoulder: -8 * tension - shoulderHunchRotation,
    l_elbow: 10 * tension,
    r_elbow: 10 * tension,
    l_wrist: 7.5 * tension + state.currentFidgetHand,
    r_wrist: 7.5 * tension - state.currentFidgetHand,
    l_hand: 7.5 * tension + state.currentFidgetHand, 
    r_hand: 7.5 * tension - state.currentFidgetHand, 
    l_knee: 5 + breathVal * 0.3,
    r_knee: 5 + breathVal * 0.3,
    l_thigh: -8 + swayVal * 8 * settings.weightShift,
    r_thigh: 8 + swayVal * 8 * settings.weightShift,
    x_offset: 0,
    y_offset: 0,
  };
};
