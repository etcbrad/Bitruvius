import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, X, Layers, Settings, Eye, EyeOff, Grid3x3 } from 'lucide-react';

import type { 
  CutoutEditorState, 
  CutoutNode, 
  AnchorPoint, 
  CutoutPiece, 
  SkeletonState,
  CutoutEditorMode 
} from '../engine/types';

interface CutoutEditorProps {
  state: SkeletonState;
  setState: (updater: (prev: SkeletonState) => SkeletonState) => void;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
}

export const CutoutEditor: React.FC<CutoutEditorProps> = ({ 
  state, 
  setState, 
  setStateWithHistory 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dragActive, setDragActive] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const editorState = state.cutoutEditor;
  const mode = editorState?.mode || 'layout';

  // Return early if editor state is not available
  if (!editorState) {
    return (
      <div className="flex items-center justify-center h-full bg-[#1a1612]">
        <div className="text-white/70">Loading cutout editor...</div>
      </div>
    );
  }

  // Initialize cutout editor state if not present
  useEffect(() => {
    if (!state.cutoutEditor) {
      setState(prev => ({
        ...prev,
        cutoutEditor: {
          mode: 'layout',
          nodes: {},
          selectedNodeId: null,
          selectedAnchorId: null,
          showAnchors: true,
          showConnections: true,
          snapToAnchors: true,
          gridSize: 20,
          viewTransform: { x: 0, y: 0, scale: 1 }
        }
      }));
    }
  }, [state.cutoutEditor, setState]);

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('images', file));
    formData.append('min_area', '500');

    try {
      const response = await fetch('/api/segment_multi', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      
      // Add pieces to cutout editor
      setStateWithHistory('upload_cutout_sheet', (prev) => {
        const updatedEditor = { ...prev.cutoutEditor };
        const newNodes = { ...updatedEditor.nodes };
        
        data.pieces.forEach((piece: CutoutPiece, index: number) => {
          const nodeId = `node_${Date.now()}_${index}`;
          const node: CutoutNode = {
            id: nodeId,
            name: `Piece ${index + 1}`,
            assetId: piece.id,
            transform: {
              x: Math.random() * 400 - 200,
              y: Math.random() * 300 - 150,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              flipX: false,
            },
            anchors: piece.autoAnchors.map((pos, i) => ({
              id: `anchor_${nodeId}_${i}`,
              localPosition: pos,
              connectedTo: null,
              jointMapping: null,
              type: 'free',
              visible: true,
            })),
            parent: null,
            children: [],
            visible: true,
            opacity: 1,
            zIndex: index,
            locked: false,
          };
          
          newNodes[nodeId] = node;
        });

        return {
          ...prev,
          cutoutEditor: {
            ...updatedEditor,
            nodes: newNodes,
          }
        };
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
      console.error('Upload error:', error);
    }
  }, [setStateWithHistory]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  // Canvas resize handler
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width, height });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Mode toggle
  const setMode = useCallback((newMode: CutoutEditorMode) => {
    setStateWithHistory('set_cutout_mode', (prev) => ({
      ...prev,
      cutoutEditor: {
        ...prev.cutoutEditor,
        mode: newMode,
      }
    }));
  }, [setStateWithHistory]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply view transform
    ctx.save();
    ctx.translate(editorState.viewTransform.x, editorState.viewTransform.y);
    ctx.scale(editorState.viewTransform.scale, editorState.viewTransform.scale);

    // Draw grid
    if (mode === 'layout') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      const gridSize = editorState.gridSize;
      
      for (let x = -1000; x <= 1000; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -1000);
        ctx.lineTo(x, 1000);
        ctx.stroke();
      }
      
      for (let y = -1000; y <= 1000; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-1000, y);
        ctx.lineTo(1000, y);
        ctx.stroke();
      }
    }

    // Draw connections
    if (editorState.showConnections) {
      ctx.strokeStyle = 'rgba(106, 170, 138, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      
      Object.values(editorState.nodes).forEach(node => {
        if (node.parent) {
          const parentNode = editorState.nodes[node.parent];
          if (parentNode) {
            ctx.beginPath();
            ctx.moveTo(parentNode.transform.x, parentNode.transform.y);
            ctx.lineTo(node.transform.x, node.transform.y);
            ctx.stroke();
          }
        }
      });
      
      ctx.setLineDash([]);
    }

    // Draw nodes
    Object.values(editorState.nodes)
      .sort((a, b) => a.zIndex - b.zIndex)
      .forEach(node => {
        if (!node.visible) return;

        ctx.save();
        ctx.translate(node.transform.x, node.transform.y);
        ctx.rotate(node.transform.rotation);
        ctx.scale(node.transform.scaleX * (node.transform.flipX ? -1 : 1), node.transform.scaleY);
        ctx.globalAlpha = node.opacity;

        // Draw placeholder rectangle for now (will be replaced with actual image)
        ctx.fillStyle = node.id === editorState.selectedNodeId ? 'rgba(201, 168, 76, 0.3)' : 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(-50, -50, 100, 100);
        
        if (node.id === editorState.selectedNodeId) {
          ctx.strokeStyle = '#c9a84c';
          ctx.lineWidth = 2;
          ctx.strokeRect(-50, -50, 100, 100);
        }

        ctx.restore();

        // Draw anchors
        if (editorState.showAnchors) {
          node.anchors.forEach(anchor => {
            if (!anchor.visible) return;

            // Apply node transform to anchor local position
            const cos = Math.cos(node.transform.rotation);
            const sin = Math.sin(node.transform.rotation);
            const scaleX = (node.transform.scaleX || 1) * (node.transform.flipX ? -1 : 1);
            const scaleY = node.transform.scaleY || 1;
            
            // Rotate and scale anchor local position
            const rotatedX = anchor.localPosition.x * scaleX * cos - anchor.localPosition.y * scaleY * sin;
            const rotatedY = anchor.localPosition.x * scaleX * sin + anchor.localPosition.y * scaleY * cos;
            
            // Add node world position
            const worldX = node.transform.x + rotatedX;
            const worldY = node.transform.y + rotatedY;
            
            ctx.beginPath();
            ctx.arc(worldX, worldY, 6, 0, Math.PI * 2);
            
            if (anchor.id === editorState.selectedAnchorId) {
              ctx.fillStyle = '#c9a84c';
            } else if (anchor.connectedTo) {
              ctx.fillStyle = '#6aaa8a';
            } else {
              ctx.fillStyle = node.id === editorState.selectedNodeId ? '#e8c46a' : 'rgba(255, 255, 255, 0.5)';
            }
            
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
      });

    ctx.restore();
  }, [editorState, canvasSize, mode]);

  return (
    <div className="flex flex-col h-full bg-[#1a1612]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-[#252018]">
        {uploadError && (
          <div className="px-3 py-2 bg-red-600 text-white text-sm rounded">
            {uploadError}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('layout')}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              mode === 'layout' 
                ? 'bg-[#c9a84c] text-black' 
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Layout
          </button>
          <button
            onClick={() => setMode('pose')}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              mode === 'pose' 
                ? 'bg-[#c9a84c] text-black' 
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Pose
          </button>
          <button
            onClick={() => setMode('animation')}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              mode === 'animation' 
                ? 'bg-[#c9a84c] text-black' 
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Animation
          </button>
        </div>

        <div className="h-6 w-px bg-white/20" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStateWithHistory('toggle_anchors', (prev) => ({
              ...prev,
              cutoutEditor: {
                ...prev.cutoutEditor,
                showAnchors: !prev.cutoutEditor.showAnchors,
              }
            }))}
            className={`p-2 rounded transition-colors ${
              editorState.showAnchors 
                ? 'bg-[#c9a84c] text-black' 
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
            title="Toggle Anchors"
          >
            <Grid3x3 size={14} />
          </button>
          
          <button
            onClick={() => setStateWithHistory('toggle_connections', (prev) => ({
              ...prev,
              cutoutEditor: {
                ...prev.cutoutEditor,
                showConnections: !prev.cutoutEditor.showConnections,
              }
            }))}
            className={`p-2 rounded transition-colors ${
              editorState.showConnections 
                ? 'bg-[#c9a84c] text-black' 
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
            title="Toggle Connections"
          >
            <Layers size={14} />
          </button>
        </div>

        <div className="flex-1" />

        <div className="text-xs text-white/50 font-mono">
          {mode.toUpperCase()} MODE
        </div>
      </div>

      {/* Canvas Container */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Upload Overlay */}
        {Object.keys(editorState.nodes).length === 0 && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-colors ${
            dragActive ? 'bg-[#c9a84c20]' : ''
          }`}>
            <div className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive ? 'border-[#c9a84c] bg-[#c9a84c10]' : 'border-white/20 bg-white/5'
            }`}>
              <Upload size={48} className="text-white/40 mb-4" />
              <h3 className="text-lg font-serif text-[#c9a84c] mb-2">Drop cutout sheets here</h3>
              <p className="text-sm text-white/60 mb-4">PNG or JPG · multiple files OK</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-transparent border border-[#c9a84c] text-[#c9a84c] rounded hover:bg-[#c9a84c20] transition-colors text-sm font-mono"
              >
                Browse files…
              </button>
            </div>
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0"
          style={{ 
            background: 'radial-gradient(circle at 50% 45%, rgba(201,168,76,0.025) 0%, transparent 65%), repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.018) 39px, rgba(255,255,255,0.018) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.018) 39px, rgba(255,255,255,0.018) 40px)'
          }}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
};
