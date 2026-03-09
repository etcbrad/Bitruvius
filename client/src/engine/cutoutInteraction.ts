import type { 
  CutoutNode, 
  AnchorPoint, 
  Vector2D, 
  CutoutEditorState,
  CutoutEditorMode 
} from './types';

export type DragOperation = {
  type: 'move' | 'rotate' | 'scale' | 'connect' | 'pan';
  nodeId?: string;
  anchorId?: string;
  startPosition: Vector2D;
  startTransform?: any;
  startRotation?: number;
  startScale?: Vector2D;
};

export type HitTest = {
  nodeId?: string;
  anchorId?: string;
  position: Vector2D;
  distance: number;
};

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(
  screenPos: Vector2D, 
  viewTransform: CutoutEditorState['viewTransform']
): Vector2D {
  return {
    x: (screenPos.x - viewTransform.x) / viewTransform.scale,
    y: (screenPos.y - viewTransform.y) / viewTransform.scale,
  };
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(
  worldPos: Vector2D, 
  viewTransform: CutoutEditorState['viewTransform']
): Vector2D {
  return {
    x: worldPos.x * viewTransform.scale + viewTransform.x,
    y: worldPos.y * viewTransform.scale + viewTransform.y,
  };
}

/**
 * Get world position of an anchor point
 */
export function getAnchorWorldPosition(
  node: CutoutNode, 
  anchor: AnchorPoint
): Vector2D {
  // Apply node rotation to anchor local position
  const cos = Math.cos(node.transform.rotation || 0);
  const sin = Math.sin(node.transform.rotation || 0);
  
  // Rotate anchor local position around node origin
  const rotatedX = anchor.localPosition.x * cos - anchor.localPosition.y * sin;
  const rotatedY = anchor.localPosition.x * sin + anchor.localPosition.y * cos;
  
  // Add node world position
  return {
    x: node.transform.x + rotatedX,
    y: node.transform.y + rotatedY,
  };
}

/**
 * Hit test for nodes and anchors
 */
export function hitTest(
  worldPos: Vector2D, 
  editorState: CutoutEditorState,
  threshold: number = 10
): HitTest {
  const { nodes } = editorState;
  
  // Check anchors first (higher priority)
  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const anchor of node.anchors) {
      if (!anchor.visible) continue;
      
      const anchorWorldPos = getAnchorWorldPosition(node, anchor);
      const distance = Math.hypot(
        worldPos.x - anchorWorldPos.x,
        worldPos.y - anchorWorldPos.y
      );
      
      if (distance < threshold) {
        return {
          nodeId,
          anchorId: anchor.id,
          position: anchorWorldPos,
          distance,
        };
      }
    }
  }
  
  // Check nodes
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!node.visible) continue;
    
    // Use asset dimensions if available, otherwise default to 100x100
    const nodeWidth = 100; // TODO: Get from asset or node metadata
    const nodeHeight = 100; // TODO: Get from asset or node metadata
    const halfWidth = nodeWidth / 2 * (node.transform.scaleX || 1);
    const halfHeight = nodeHeight / 2 * (node.transform.scaleY || 1);
    
    // Simple bounding box test
    const inBounds = 
      worldPos.x >= node.transform.x - halfWidth &&
      worldPos.x <= node.transform.x + halfWidth &&
      worldPos.y >= node.transform.y - halfHeight &&
      worldPos.y <= node.transform.y + halfHeight;
    
    if (inBounds) {
      return {
        nodeId,
        position: { x: node.transform.x, y: node.transform.y },
        distance: 0,
      };
    }
  }
  
  return { position: worldPos, distance: Infinity };
}

/**
 * Find nearest anchor for snapping
 */
export function findNearestAnchor(
  worldPos: Vector2D, 
  editorState: CutoutEditorState,
  excludeNodeId?: string,
  snapDistance: number = 30
): { nodeId: string; anchorId: string; position: Vector2D } | null {
  const { nodes } = editorState;
  let nearest = null;
  let minDistance = snapDistance;
  
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (nodeId === excludeNodeId || !node.visible) continue;
    
    for (const anchor of node.anchors) {
      if (!anchor.visible || anchor.connectedTo) continue;
      
      const anchorWorldPos = getAnchorWorldPosition(node, anchor);
      const distance = Math.hypot(
        worldPos.x - anchorWorldPos.x,
        worldPos.y - anchorWorldPos.y
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          nodeId,
          anchorId: anchor.id,
          position: anchorWorldPos,
        };
      }
    }
  }
  
  return nearest;
}

/**
 * Start a drag operation
 */
export function startDrag(
  hitTest: HitTest, 
  editorState: CutoutEditorState,
  mode: CutoutEditorMode
): DragOperation | null {
  if (mode === 'layout') {
    if (hitTest.anchorId && hitTest.nodeId) {
      // Start anchor connection drag
      return {
        type: 'connect',
        nodeId: hitTest.nodeId,
        anchorId: hitTest.anchorId,
        startPosition: hitTest.position,
      };
    } else if (hitTest.nodeId) {
      const node = editorState.nodes[hitTest.nodeId];
      if (node) {
        // Start node move/rotate drag
        return {
          type: 'move',
          nodeId: hitTest.nodeId,
          startPosition: hitTest.position,
          startTransform: { ...node.transform },
        };
      }
    }
  } else if (mode === 'pose') {
    if (hitTest.nodeId) {
      const node = editorState.nodes[hitTest.nodeId];
      if (node) {
        // Start rotation drag in pose mode
        return {
          type: 'rotate',
          nodeId: hitTest.nodeId,
          startPosition: hitTest.position,
          startTransform: { ...node.transform },
          startRotation: node.transform.rotation,
        };
      }
    }
  }
  
  // Start pan drag for empty space
  return {
    type: 'pan',
    startPosition: hitTest.position,
  };
}

/**
 * Update a drag operation
 */
export function updateDrag(
  drag: DragOperation, 
  currentPosition: Vector2D,
  editorState: CutoutEditorState
): Partial<CutoutEditorState> {
  const updates: Partial<CutoutEditorState> = { nodes: { ...editorState.nodes } };
  
  switch (drag.type) {
    case 'move': {
      if (!drag.nodeId) break;
      
      const node = editorState.nodes[drag.nodeId];
      if (!node || node.locked) break;
      
      const deltaX = currentPosition.x - drag.startPosition.x;
      const deltaY = currentPosition.y - drag.startPosition.y;
      
      const updatedNode = {
        ...node,
        transform: {
          ...node.transform,
          x: drag.startTransform.x + deltaX,
          y: drag.startTransform.y + deltaY,
        },
      };
      
      (updates.nodes as Record<string, CutoutNode>)[drag.nodeId] = updatedNode;
      break;
    }
    
    case 'rotate': {
      if (!drag.nodeId) break;
      
      const node = editorState.nodes[drag.nodeId];
      if (!node || node.locked) break;
      
      const center = { x: node.transform.x, y: node.transform.y };
      const startAngle = Math.atan2(
        drag.startPosition.y - center.y,
        drag.startPosition.x - center.x
      );
      const currentAngle = Math.atan2(
        currentPosition.y - center.y,
        currentPosition.x - center.x
      );
      
      const rotation = drag.startRotation! + (currentAngle - startAngle);
      
      const updatedNode = {
        ...node,
        transform: {
          ...node.transform,
          rotation,
        },
      };
      
      (updates.nodes as Record<string, CutoutNode>)[drag.nodeId] = updatedNode;
      break;
    }
    
    case 'scale': {
      if (!drag.nodeId) break;
      
      const node = editorState.nodes[drag.nodeId];
      if (!node || node.locked) break;
      
      const center = { x: node.transform.x, y: node.transform.y };
      const startDistance = Math.hypot(
        drag.startPosition.x - center.x,
        drag.startPosition.y - center.y
      );
      
      // Guard against division by zero
      if (startDistance < 0.001) break;
      
      const currentDistance = Math.hypot(
        currentPosition.x - center.x,
        currentPosition.y - center.y
      );
      
      const scaleRatio = currentDistance / startDistance;
      const minScale = 0.1;
      const maxScale = 5.0;
      
      const updatedNode = {
        ...node,
        transform: {
          ...node.transform,
          scaleX: Math.max(minScale, Math.min(maxScale, drag.startScale!.x * scaleRatio)),
          scaleY: Math.max(minScale, Math.min(maxScale, drag.startScale!.y * scaleRatio)),
        },
      };
      
      (updates.nodes as Record<string, CutoutNode>)[drag.nodeId] = updatedNode;
      break;
    }
    
    case 'connect': {
      // Connection is handled on mouse up
      break;
    }
    
    case 'pan': {
      const deltaX = (currentPosition.x - drag.startPosition.x) * editorState.viewTransform.scale;
      const deltaY = (currentPosition.y - drag.startPosition.y) * editorState.viewTransform.scale;
      
      updates.viewTransform = {
        ...editorState.viewTransform,
        x: editorState.viewTransform.x + deltaX,
        y: editorState.viewTransform.y + deltaY,
      };
      break;
    }
  }
  
  return updates;
}

/**
 * Complete a drag operation
 */
export function completeDrag(
  drag: DragOperation, 
  finalPosition: Vector2D,
  editorState: CutoutEditorState
): Partial<CutoutEditorState> {
  const updates: Partial<CutoutEditorState> = { nodes: { ...editorState.nodes } };
  
  if (drag.type === 'connect' && drag.nodeId && drag.anchorId) {
    // Find nearest anchor to connect to
    const nearestAnchor = findNearestAnchor(finalPosition, editorState, drag.nodeId);
    
    if (nearestAnchor) {
      // Check for cycles before creating connection
      if (wouldCreateCycle(drag.nodeId, nearestAnchor.nodeId, editorState)) {
        return updates; // Skip connection to avoid cycle
      }
      const sourceNode = editorState.nodes[drag.nodeId];
      const targetNode = editorState.nodes[nearestAnchor.nodeId];
      
      if (sourceNode && targetNode) {
        // Create new node clones with immutable updates
        const newSourceNode = { ...sourceNode };
        const newTargetNode = { ...targetNode };
        
        // Update source anchor
        newSourceNode.anchors = sourceNode.anchors.map(anchor => 
          anchor.id === drag.anchorId 
            ? { ...anchor, connectedTo: nearestAnchor.anchorId || null, type: 'parent' }
            : anchor
        );
        
        // Update target anchor
        newTargetNode.anchors = targetNode.anchors.map(anchor => 
          anchor.id === nearestAnchor.anchorId 
            ? { ...anchor, connectedTo: drag.anchorId || null, type: 'child' }
            : anchor
        );
        
        // Update parent-child relationships
        newSourceNode.parent = nearestAnchor.nodeId;
        newTargetNode.children = [...targetNode.children, drag.nodeId];
        
        (updates.nodes as Record<string, CutoutNode>)[drag.nodeId] = newSourceNode;
        (updates.nodes as Record<string, CutoutNode>)[nearestAnchor.nodeId] = newTargetNode;
      }
    }
  }
  
  return updates;
}

/**
 * Delete a node and clean up connections
 */
export function deleteNode(
  nodeId: string, 
  editorState: CutoutEditorState
): Partial<CutoutEditorState> {
  const { nodes } = editorState;
  const nodeToDelete = nodes[nodeId];
  
  if (!nodeToDelete) return {};
  
  const updates: Partial<CutoutEditorState> = { nodes: { ...nodes } };
  
  // Remove from parent's children
  if (nodeToDelete.parent) {
    const parentNode = nodes[nodeToDelete.parent];
    if (parentNode) {
      (updates.nodes as Record<string, CutoutNode>)[nodeToDelete.parent] = {
        ...parentNode,
        children: parentNode.children.filter(id => id !== nodeId),
      };
    }
  }
  
  // Remove children and make them root nodes
  nodeToDelete.children.forEach(childId => {
    const childNode = nodes[childId];
    if (childNode) {
      (updates.nodes as Record<string, CutoutNode>)[childId] = {
        ...childNode,
        parent: null,
      };
    }
  });
  
  // Clean up anchor connections
  Object.values(nodes).forEach(node => {
    node.anchors.forEach(anchor => {
      if (anchor.connectedTo === nodeId) {
        anchor.connectedTo = null;
        anchor.type = 'free';
      }
    });
  });
  
  // Delete the node
  delete (updates.nodes as Record<string, CutoutNode>)[nodeId];
  
  return updates;
}

/**
 * Check if connecting two nodes would create a cycle
 */
export function wouldCreateCycle(
  fromNodeId: string, 
  toNodeId: string, 
  editorState: CutoutEditorState
): boolean {
  const visited = new Set<string>();
  let current: string | null = toNodeId;
  
  while (current && !visited.has(current)) {
    if (current === fromNodeId) return true;
    visited.add(current);
    const parentNode: CutoutNode | undefined = editorState.nodes[current];
    current = parentNode?.parent || null;
  }
  
  return false;
}
