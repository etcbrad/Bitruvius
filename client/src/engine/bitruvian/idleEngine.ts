import { IdleSettings, WalkingEnginePose } from './types';
import { lerp, clamp } from './kinematics';
import { BITRUVIAN_CONSTANTS } from './types';

// Enhanced idle state variables
let gazeTargetX = 0;
let gazeTargetY = 0;
let lastGazeShiftTime = 0;
let currentGazeX = 0;
let currentGazeY = 0;

let fidgetTargetNeck = 0;
let fidgetTargetHand = 0;
let lastFidgetShiftTime = 0;
let currentFidgetNeck = 0;
let currentFidgetHand = 0;

let heavyBreathingIntensityInternal = 0;
let tremorTarget = 0;
let currentTremor = 0;
let lastTremorUpdateTime = 0;

export const updateIdlePhysics = (
  time: number,
  deltaTime: number,
  settings: IdleSettings,
  locomotionWeight: number,
): Partial<WalkingEnginePose> => {
  const t = time;
  const dampenedSpeed = Math.pow(settings.transitionSpeed, 1 + BITRUVIAN_CONSTANTS.IDLE_PHYSICS.MAX_SPEED_DAMPENING_FACTOR);
  const idleSpeed = lerp(0.05, 0.5, dampenedSpeed);

  // Enhanced heavy breathing system
  if (locomotionWeight > 0.9) {
    heavyBreathingIntensityInternal = Math.min(1, heavyBreathingIntensityInternal + deltaTime * 0.001);
  } else {
    heavyBreathingIntensityInternal = Math.max(0, heavyBreathingIntensityInternal - deltaTime * 0.0005);
  }
  const effectiveHeavyBreathing = heavyBreathingIntensityInternal;

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
    if (t - lastTremorUpdateTime > (250 + Math.random() * 250) / idleSpeed) {
      tremorTarget = (Math.random() * 2 - 1) * 0.8;
      lastTremorUpdateTime = t;
    }
    currentTremor = lerp(currentTremor, tremorTarget, 0.1);
    tremor = currentTremor * tension;
  }
  
  const collarHunchYOffset = -tension * 0.06; 
  const shoulderHunchRotation = tension * 6;

  // Enhanced gaze system with realistic timing
  const gazeShiftInterval = (4000 + Math.random() * 4000) / idleSpeed;
  if (t - lastGazeShiftTime > gazeShiftInterval * (1.5 - settings.gazeSway)) {
    gazeTargetX = (Math.random() * 2 - 1) * 6 * settings.gazeSway;
    gazeTargetY = (Math.random() * 2 - 1) * 4 * settings.gazeSway;
    lastGazeShiftTime = t;
  }
  const gazeProgress = clamp((t - lastGazeShiftTime) / (800 / idleSpeed), 0, 1);
  currentGazeX = lerp(currentGazeX, settings.gazeSway > 0.01 ? gazeTargetX : 0, gazeProgress);
  currentGazeY = lerp(currentGazeY, settings.gazeSway > 0.01 ? gazeTargetY : 0, gazeProgress);

  // Enhanced fidgeting system
  const fidgetInterval = (6000 + Math.random() * 6000) / idleSpeed;
  if (t - lastFidgetShiftTime > fidgetInterval * (1.5 - settings.fidgetFrequency)) {
    fidgetTargetNeck = (Math.random() * 2 - 1) * 2 * settings.fidgetFrequency;
    fidgetTargetHand = (Math.random() * 2 - 1) * 1 * settings.fidgetFrequency;
    lastFidgetShiftTime = t;
  }
  const fidgetProgress = Math.min(1, (t - lastFidgetShiftTime) / (1000 / idleSpeed));
  currentFidgetNeck = lerp(currentFidgetNeck, settings.fidgetFrequency > 0.01 ? fidgetTargetNeck : 0, fidgetProgress);
  currentFidgetHand = lerp(currentFidgetHand, settings.fidgetFrequency > 0.01 ? fidgetTargetHand : 0, fidgetProgress);

  return {
    torso: torsoBias + breathVal * torsoBreathAmp + swayVal * 2,
    collar: collarBias + breathVal * collarBreathAmp + tremor + currentGazeY,
    collarYOffset: collarHunchYOffset, 
    neck: neckBias + currentGazeX + currentFidgetNeck,
    l_shoulder: 8 * tension + shoulderHunchRotation,
    r_shoulder: -8 * tension - shoulderHunchRotation,
    l_elbow: 10 * tension,
    r_elbow: 10 * tension,
    l_wrist: 7.5 * tension + currentFidgetHand,
    r_wrist: 7.5 * tension - currentFidgetHand,
    l_hand: 7.5 * tension + currentFidgetHand, 
    r_hand: 7.5 * tension - currentFidgetHand, 
    l_knee: 5 + breathVal * 0.3,
    r_knee: 5 + breathVal * 0.3,
    l_thigh: -8 + swayVal * 8 * settings.weightShift,
    r_thigh: 8 + swayVal * 8 * settings.weightShift,
    x_offset: 0,
    y_offset: 0,
  };
};
