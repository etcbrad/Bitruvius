import React, { useMemo } from 'react';
import type { Point, SkeletonState } from '@/engine/types';
import { getWorldPosition } from '@/engine/kinematics';
import { INITIAL_JOINTS } from '@/engine/model';

type CanvasSize = { width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

const mul = (v: Point, s: number): Point => ({ x: v.x * s, y: v.y * s });

const normalize = (v: Point): Point => {
  const d = Math.hypot(v.x, v.y);
  if (!Number.isFinite(d) || d < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / d, y: v.y / d };
};

const rotate = (p: Point, aRad: number): Point => {
  const c = Math.cos(aRad);
  const s = Math.sin(aRad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

const pathTrapezoid = (topY: number, bottomY: number, topW: number, bottomW: number, cx: number) => {
  const topL = cx - topW / 2;
  const topR = cx + topW / 2;
  const botL = cx - bottomW / 2;
  const botR = cx + bottomW / 2;
  return `M ${topL} ${topY} L ${topR} ${topY} L ${botR} ${bottomY} L ${botL} ${bottomY} Z`;
};

const pathTaperedOval = (cx: number, cy: number, rx: number, ry: number, taper: number) => {
  const t = clamp(taper, 0.2, 0.95);
  const top = { x: cx, y: cy - ry };
  const bottom = { x: cx, y: cy + ry };
  const left = { x: cx - rx, y: cy };
  const right = { x: cx + rx, y: cy };
  const bottomRx = rx * t;
  const bottomLeft = { x: cx - bottomRx, y: cy + ry * 0.65 };
  const bottomRight = { x: cx + bottomRx, y: cy + ry * 0.65 };

  return [
    `M ${top.x} ${top.y}`,
    `C ${right.x} ${top.y} ${right.x} ${cy - ry * 0.25} ${right.x} ${cy}`,
    `C ${right.x} ${cy + ry * 0.25} ${bottomRight.x} ${bottomRight.y} ${bottom.x} ${bottom.y}`,
    `C ${bottomLeft.x} ${bottomLeft.y} ${left.x} ${cy + ry * 0.25} ${left.x} ${cy}`,
    `C ${left.x} ${cy - ry * 0.25} ${left.x} ${top.y} ${top.x} ${top.y}`,
    'Z',
  ].join(' ');
};

const pathRibcage = (cx: number, cy: number, topW: number, bottomW: number, h: number) => {
  const halfH = h / 2;
  const topY = cy - halfH;
  const botY = cy + halfH;
  const topRx = topW / 2;
  const botRx = bottomW / 2;
  const k = 0.55;
  return [
    `M ${cx} ${topY}`,
    `C ${cx + topRx} ${topY} ${cx + topRx} ${cy - halfH * k} ${cx + topRx} ${cy}`,
    `C ${cx + topRx} ${cy + halfH * k} ${cx + botRx} ${botY} ${cx} ${botY}`,
    `C ${cx - botRx} ${botY} ${cx - topRx} ${cy + halfH * k} ${cx - topRx} ${cy}`,
    `C ${cx - topRx} ${cy - halfH * k} ${cx - topRx} ${topY} ${cx} ${topY}`,
    'Z',
  ].join(' ');
};

export function HumanoidBacklightOverlay({
  state,
  canvasSize,
  backlightEnabled,
  onZoneMouseDown,
}: {
  state: SkeletonState;
  canvasSize: CanvasSize;
  backlightEnabled: boolean;
  onZoneMouseDown: (jointId: string) => (e: React.MouseEvent) => void;
}) {
  const WORLD_PX_SCALE = 20;
  const centerX = canvasSize.width / 2;
  const centerY = canvasSize.height / 2;

  const pxFromWorld = (w: Point): Point => ({
    x: w.x * WORLD_PX_SCALE + centerX,
    y: w.y * WORLD_PX_SCALE + centerY,
  });

  const geom = useMemo(() => {
    if (!backlightEnabled) return null;

    const w = (id: string) => getWorldPosition(id, state.joints, INITIAL_JOINTS, 'preview');
    const req = (id: string) => {
      const p = w(id);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return p;
    };

    const navel = req('navel');
    const sternum = req('sternum');
    const collar = req('collar');
    const skullRaw = req('head');
    const headRaw = req('head');
    const lClav = req('l_clavicle');
    const rClav = req('r_clavicle');
    const lHip = req('l_hip');
    const rHip = req('r_hip');
    if (!navel || !sternum || !collar || !lClav || !rClav || !lHip || !rHip) return null;

    const head = headRaw;
    if (!head) return null;

    const navelPx = pxFromWorld(navel);
    const sternumPx = pxFromWorld(sternum);
    const collarPx = pxFromWorld(collar);
    const headPx = pxFromWorld(head);
    const lClavPx = pxFromWorld(lClav);
    const rClavPx = pxFromWorld(rClav);
    const lHipPx = pxFromWorld(lHip);
    const rHipPx = pxFromWorld(rHip);

    const shoulderMidPx = mul(add(lClavPx, rClavPx), 0.5);
    const hipMidPx = mul(add(lHipPx, rHipPx), 0.5);
    const centerlineX = (Math.min(lClavPx.x, rClavPx.x, lHipPx.x, rHipPx.x) + Math.max(lClavPx.x, rClavPx.x, lHipPx.x, rHipPx.x)) / 2;

    const headHeightPxMeasured = Math.max(12, dist(collarPx, headPx));
    const headAngleRad = Math.atan2(headPx.y - collarPx.y, headPx.x - collarPx.x) - Math.PI / 2;

    const pelvisWMeasured = Math.max(18, dist(lHipPx, rHipPx));
    const shoulderWMeasured = Math.max(18, dist(lClavPx, rClavPx));
    // The rig's head segment is intentionally short; anchor head scale to shoulder span for a humanoid read.
    const headRadiusPx = Math.max(headHeightPxMeasured / 2, shoulderWMeasured / 6, pelvisWMeasured / 5, 42);

    // Enforce Vitruvian-ish mass targets (these are overlays/influence zones, not literal bones).
    const pelvisW = Math.max(pelvisWMeasured, headRadiusPx * 4.0);
    const shoulderW = Math.max(shoulderWMeasured, pelvisW * 1.5, headRadiusPx * 6.0);

    const torsoLen = Math.max(20, dist(navelPx, collarPx));
    const ribH = clamp(torsoLen * 0.58, headRadiusPx * 1.8, headRadiusPx * 3.25);
    const ribCenterY = collarPx.y + ribH * 0.55;
    const ribTopW = shoulderW * 0.62;
    const ribBotW = shoulderW * 0.72;

    const ribBottomY = ribCenterY + ribH / 2;
    const triApex = navelPx;
    const triBaseY = ribBottomY - ribH * 0.12;
    const triBaseW = clamp(pelvisW * 0.95, headRadiusPx * 1.1, shoulderW * 0.75);

    const pelvisH = clamp(headRadiusPx * 1.35, 70, 220);
    // Some rigs keep hip joints slightly above the navel; for a humanoid silhouette, bias the bowl below the navel.
    const pelvisAnchorY = Math.max(hipMidPx.y + pelvisH * 0.15, navelPx.y + headRadiusPx * 0.55);
    const pelvisTopY = pelvisAnchorY - pelvisH * 0.45;
    const pelvisBottomY = pelvisAnchorY + pelvisH * 0.55;
    const pelvisTopW = pelvisW;
    const pelvisBottomW = pelvisW * 0.62;

    const shoulderTopY = collarPx.y + headRadiusPx * 0.05;
    const shoulderBottomY = Math.max(shoulderTopY + headRadiusPx * 0.25, shoulderMidPx.y + headRadiusPx * 0.35);
    const shoulderTopW = shoulderW * 0.55;
    const shoulderBottomW = shoulderW;

    const jawCx = headPx.x + rotate({ x: 0, y: headRadiusPx * 0.25 }, headAngleRad).x;
    const jawCy = headPx.y + rotate({ x: 0, y: headRadiusPx * 0.25 }, headAngleRad).y;

    const restTorso = dist(
      getWorldPosition('navel', INITIAL_JOINTS, INITIAL_JOINTS, 'preview'),
      getWorldPosition('sternum', INITIAL_JOINTS, INITIAL_JOINTS, 'preview'),
    );
    const curTorso = dist(navel, sternum);
    const torsoStretch = restTorso > 1e-6 ? curTorso / restTorso : 1;

    return {
      px: {
        centerlineX,
        head: headPx,
        headRadiusPx,
        headAngleRad,
        jawCx,
        jawCy,
        ribCx: centerlineX,
        ribCy: ribCenterY,
        ribTopW,
        ribBotW,
        ribH,
        shoulderTopY,
        shoulderBottomY,
        shoulderTopW,
        shoulderBottomW,
        pelvisTopY,
        pelvisBottomY,
        pelvisTopW,
        pelvisBottomW,
        triBaseY,
        triBaseW,
        triApex,
      },
      tension: {
        torsoStretch: clamp(torsoStretch, 0.5, 2.0),
      },
    };
  }, [backlightEnabled, canvasSize.height, canvasSize.width, state.joints]);

  if (!geom) return null;

  const core = 'rgba(0, 255, 136, 0.34)';
  const halo = 'rgba(170, 85, 255, 0.26)';
  const strokeCore = 'rgba(0, 255, 136, 0.46)';

  const haloBoost = clamp((geom.tension.torsoStretch - 1) * 1.4, 0, 1);
  const haloOpacity = 0.65 + haloBoost * 0.35;
  const coreOpacity = 0.9;

  const ribPath = pathRibcage(geom.px.ribCx, geom.px.ribCy, geom.px.ribTopW, geom.px.ribBotW, geom.px.ribH);
  const shoulderPath = pathTrapezoid(
    geom.px.shoulderTopY,
    geom.px.shoulderBottomY,
    geom.px.shoulderTopW,
    geom.px.shoulderBottomW,
    geom.px.centerlineX,
  );
  const pelvisPath = pathTrapezoid(
    geom.px.pelvisTopY,
    geom.px.pelvisBottomY,
    geom.px.pelvisTopW,
    geom.px.pelvisBottomW,
    geom.px.centerlineX,
  );
  const abdomenTri = [
    { x: geom.px.centerlineX - geom.px.triBaseW / 2, y: geom.px.triBaseY },
    { x: geom.px.centerlineX + geom.px.triBaseW / 2, y: geom.px.triBaseY },
    geom.px.triApex,
  ];
  const abdomenPath = `M ${abdomenTri[0]!.x} ${abdomenTri[0]!.y} L ${abdomenTri[1]!.x} ${abdomenTri[1]!.y} L ${abdomenTri[2]!.x} ${abdomenTri[2]!.y} Z`;

  const jawPathLocal = pathTaperedOval(geom.px.jawCx, geom.px.jawCy, geom.px.headRadiusPx * 0.72, geom.px.headRadiusPx * 0.82, 0.62);

  return (
    <g style={{ mixBlendMode: 'screen' }}>
      <defs>
        <filter id="humanoid-backlight-soft" x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id="humanoid-backlight-med" x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="humanoid-backlight-sharp" x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Re-enable picking only on the zones (joints are drawn above, so they still win hits). */}
      <g pointerEvents="visiblePainted">
        {/* Shoulder girdle */}
        <g onMouseDown={onZoneMouseDown('sternum')} style={{ cursor: 'grab' }}>
          <path d={shoulderPath} fill={halo} opacity={haloOpacity} filter="url(#humanoid-backlight-med)" />
          <path d={shoulderPath} fill={core} opacity={coreOpacity} filter="url(#humanoid-backlight-sharp)" />
        </g>

        {/* Thoracic cage */}
        <g onMouseDown={onZoneMouseDown('sternum')} style={{ cursor: 'grab' }}>
          <path d={ribPath} fill={halo} opacity={haloOpacity} filter="url(#humanoid-backlight-soft)" />
          <path d={ribPath} fill={core} opacity={coreOpacity} filter="url(#humanoid-backlight-soft)" />
        </g>

        {/* Abdominal link */}
        <g onMouseDown={onZoneMouseDown('navel')} style={{ cursor: 'grab' }}>
          <path d={abdomenPath} fill={halo} opacity={haloOpacity} filter="url(#humanoid-backlight-soft)" />
          <path d={abdomenPath} fill={core} opacity={coreOpacity} filter="url(#humanoid-backlight-soft)" />
        </g>

        {/* Pelvic bowl */}
        <g onMouseDown={onZoneMouseDown('navel')} style={{ cursor: 'grab' }}>
          <path d={pelvisPath} fill={halo} opacity={clamp(haloOpacity * 1.05, 0, 1)} filter="url(#humanoid-backlight-med)" />
          <path d={pelvisPath} fill={core} opacity={1} filter="url(#humanoid-backlight-sharp)" />
          <path d={pelvisPath} fill="none" stroke="rgba(0, 255, 136, 0.9)" strokeWidth={1.75} opacity={0.7} />
        </g>

        {/* Head + jaw */}
        <g onMouseDown={onZoneMouseDown('neck_base')} style={{ cursor: 'grab' }}>
          <circle
            cx={geom.px.head.x}
            cy={geom.px.head.y}
            r={geom.px.headRadiusPx}
            fill={halo}
            opacity={haloOpacity}
            filter="url(#humanoid-backlight-med)"
          />
          <circle
            cx={geom.px.head.x}
            cy={geom.px.head.y}
            r={geom.px.headRadiusPx}
            fill={core}
            opacity={coreOpacity}
            filter="url(#humanoid-backlight-sharp)"
          />
          <path
            d={jawPathLocal}
            fill={core}
            opacity={0.38}
            filter="url(#humanoid-backlight-med)"
            transform={`rotate(${(geom.px.headAngleRad * 180) / Math.PI} ${geom.px.head.x} ${geom.px.head.y})`}
          />
        </g>
      </g>
    </g>
  );
}
