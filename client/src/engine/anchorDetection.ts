import type { Vector2D, CutoutPiece } from './types';

/**
 * Detects optimal anchor points on cutout pieces using contour analysis
 * and geometric heuristics similar to the HTML system
 */

export interface DetectedAnchor {
  position: Vector2D;
  confidence: number;
  type: 'edge' | 'corner' | 'center';
  direction?: Vector2D; // For edge anchors, indicates outward direction
}

/**
 * Analyze piece shape to find good anchor points
 */
export function detectAnchors(piece: CutoutPiece): Vector2D[] {
  const anchors: DetectedAnchor[] = [];
  const { bounds } = piece;
  
  // Calculate center
  const center: Vector2D = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  
  // Always add center anchor
  anchors.push({
    position: center,
    confidence: 0.8,
    type: 'center',
  });

  // Detect corners
  const corners = [
    { x: bounds.x, y: bounds.y, type: 'corner' as const }, // top-left
    { x: bounds.x + bounds.width, y: bounds.y, type: 'corner' as const }, // top-right
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height, type: 'corner' as const }, // bottom-right
    { x: bounds.x, y: bounds.y + bounds.height, type: 'corner' as const }, // bottom-left
  ];

  corners.forEach(corner => {
    anchors.push({
      position: corner,
      confidence: 0.9,
      type: corner.type,
    });
  });

  // Detect edge midpoints
  const edgeMidpoints = [
    { 
      x: center.x, 
      y: bounds.y, 
      type: 'edge' as const, 
      direction: { x: 0, y: -1 } 
    }, // top
    { 
      x: bounds.x + bounds.width, 
      y: center.y, 
      type: 'edge' as const, 
      direction: { x: 1, y: 0 } 
    }, // right
    { 
      x: center.x, 
      y: bounds.y + bounds.height, 
      type: 'edge' as const, 
      direction: { x: 0, y: 1 } 
    }, // bottom
    { 
      x: bounds.x, 
      y: center.y, 
      type: 'edge' as const, 
      direction: { x: -1, y: 0 } 
    }, // left
  ];

  edgeMidpoints.forEach(point => {
    anchors.push({
      position: point,
      confidence: 0.7,
      type: point.type,
      direction: point.direction,
    });
  });

  // Sort by confidence and return top positions
  anchors.sort((a, b) => b.confidence - a.confidence);
  
  // Return up to 8 best anchor positions
  return anchors.slice(0, 8).map(anchor => anchor.position);
}

/**
 * Suggest skeleton joints for a piece based on its position and shape
 */
export function suggestJointsForPiece(
  piece: CutoutPiece, 
  allPieces: CutoutPiece[]
): string[] {
  const { bounds, area } = piece;
  const suggestions: string[] = [];
  
  // Calculate relative position in the overall sheet
  const sheetBounds = calculateSheetBounds(allPieces);
  
  // Guard against degenerate bounds
  if (!sheetBounds.width || !sheetBounds.height || sheetBounds.width === 0 || sheetBounds.height === 0) {
    return [];
  }
  
  const relativeX = (bounds.x + bounds.width / 2 - sheetBounds.x) / sheetBounds.width;
  const relativeY = (bounds.y + bounds.height / 2 - sheetBounds.y) / sheetBounds.height;
  
  // Aspect ratio analysis
  const aspectRatio = bounds.height > 0 ? bounds.width / bounds.height : 1;
  
  // Size-based suggestions
  const isLarge = area > 10000;
  const isMedium = area > 3000 && area <= 10000;
  const isSmall = area <= 3000;
  
  // Position-based suggestions
  const isTopHalf = relativeY < 0.5;
  const isBottomHalf = relativeY >= 0.5;
  const isLeftHalf = relativeX < 0.5;
  const isRightHalf = relativeX >= 0.5;
  
  // Head pieces (typically small, top-center, tall aspect ratio)
  if (isSmall && isTopHalf && Math.abs(relativeX - 0.5) < 0.2 && aspectRatio < 1) {
    suggestions.push('head');
  }
  
  // Torso pieces (typically large, center)
  if (isLarge && Math.abs(relativeX - 0.5) < 0.3 && Math.abs(relativeY - 0.5) < 0.3) {
    suggestions.push('sternum', 'navel', 'collar');
  }
  
  // Arm pieces (typically medium, left/right sides, wide aspect ratio)
  if (isMedium && aspectRatio > 1.5) {
    if (isLeftHalf && isTopHalf) {
      suggestions.push('l_clavicle', 'l_bicep', 'l_elbow');
    } else if (isRightHalf && isTopHalf) {
      suggestions.push('r_clavicle', 'r_bicep', 'r_elbow');
    }
  }
  
  // Leg pieces (typically medium, bottom half, tall aspect ratio)
  if (isMedium && isBottomHalf && aspectRatio < 1) {
    if (isLeftHalf) {
      suggestions.push('l_hip', 'l_knee', 'l_ankle');
    } else if (isRightHalf) {
      suggestions.push('r_hip', 'r_knee', 'r_ankle');
    }
  }
  
  // Hand/foot pieces (typically small, extremities)
  if (isSmall) {
    if (isLeftHalf && isTopHalf) {
      suggestions.push('l_wrist', 'l_fingertip');
    } else if (isRightHalf && isTopHalf) {
      suggestions.push('r_wrist', 'r_fingertip');
    } else if (isLeftHalf && isBottomHalf) {
      suggestions.push('l_ankle', 'l_toe');
    } else if (isRightHalf && isBottomHalf) {
      suggestions.push('r_ankle', 'r_toe');
    }
  }
  
  return suggestions.slice(0, 3); // Return top 3 suggestions
}

/**
 * Calculate the bounding box of all pieces in a sheet
 */
function calculateSheetBounds(pieces: CutoutPiece[]) {
  if (pieces.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  pieces.forEach(piece => {
    minX = Math.min(minX, piece.bounds.x);
    minY = Math.min(minY, piece.bounds.y);
    maxX = Math.max(maxX, piece.bounds.x + piece.bounds.width);
    maxY = Math.max(maxY, piece.bounds.y + piece.bounds.height);
  });
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Find the best anchor connection between two pieces
 */
export function findBestAnchorConnection(
  piece1: CutoutPiece,
  anchors1: Vector2D[],
  piece2: CutoutPiece,
  anchors2: Vector2D[]
): { anchor1: Vector2D; anchor2: Vector2D; distance: number } | null {
  let bestConnection = null;
  let minDistance = Infinity;
  
  anchors1.forEach(a1 => {
    anchors2.forEach(a2 => {
      const distance = Math.hypot(
        a1.x - a2.x,
        a1.y - a2.y
      );
      
      if (distance < minDistance && distance < 100) { // Max connection distance
        minDistance = distance;
        bestConnection = { anchor1: a1, anchor2: a2, distance };
      }
    });
  });
  
  return bestConnection;
}

/**
 * Auto-connect pieces based on proximity and logical relationships
 */
export function autoConnectPieces(pieces: CutoutPiece[]): Array<{
  fromPiece: string;
  toPiece: string;
  fromAnchor: Vector2D;
  toAnchor: Vector2D;
}> {
  const connections: Array<{
    fromPiece: string;
    toPiece: string;
    fromAnchor: Vector2D;
    toAnchor: Vector2D;
  }> = [];
  
  // Generate anchors for all pieces
  const pieceAnchors = new Map<string, Vector2D[]>();
  pieces.forEach(piece => {
    pieceAnchors.set(piece.id, detectAnchors(piece));
  });
  
  // Find best connections
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const piece1 = pieces[i];
      const piece2 = pieces[j];
      const anchors1 = pieceAnchors.get(piece1.id) || [];
      const anchors2 = pieceAnchors.get(piece2.id) || [];
      
      const connection = findBestAnchorConnection(piece1, anchors1, piece2, anchors2);
      
      if (connection) {
        connections.push({
          fromPiece: piece1.id,
          toPiece: piece2.id,
          fromAnchor: connection.anchor1,
          toAnchor: connection.anchor2,
        });
      }
    }
  }
  
  // Sort by distance and return best connections
  connections.sort((a, b) => {
    const distA = Math.hypot(a.fromAnchor.x - a.toAnchor.x, a.fromAnchor.y - a.toAnchor.y);
    const distB = Math.hypot(b.fromAnchor.x - b.toAnchor.x, b.fromAnchor.y - b.toAnchor.y);
    return distA - distB;
  });
  
  return connections.slice(0, Math.min(pieces.length - 1, 10));
}
