import type { SkeletonState } from '../engine/types';
import { clamp, lerp } from '../utils';
import { BONE_PALETTE } from './constants';

export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const h = hex.trim().replace(/^#/, '');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return { r, g, b };
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
};

export const mixHex = (a: string, b: string, t: number): string => {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return a;
  const tt = clamp(t, 0, 1);
  return rgbToHex(lerp(ra.r, rb.r, tt), lerp(ra.g, rb.g, tt), lerp(ra.b, rb.b, tt));
};

export const applyLightness = (hex: string, lightness: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const l = clamp(lightness, -1, 1);
  const target = l >= 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  const t = Math.abs(l);
  return rgbToHex(lerp(rgb.r, target.r, t), lerp(rgb.g, target.g, t), lerp(rgb.b, target.b, t));
};

export const rgbCss = (hex: string, alpha = 1): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = clamp(alpha, 0, 1);
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${a})`;
};

export const getBoneHex = (boneStyle: SkeletonState['boneStyle'] | null | undefined): string => {
  const hueT = clamp(boneStyle?.hueT ?? 0, 0, 1);
  const lightness = clamp(boneStyle?.lightness ?? 0, -1, 1);
  return applyLightness(mixHex(BONE_PALETTE.violet, BONE_PALETTE.magenta, hueT), lightness);
};

