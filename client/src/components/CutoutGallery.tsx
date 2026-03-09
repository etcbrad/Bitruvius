import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Plus, 
  Grid3x3,
  Image as ImageIcon,
  X
} from 'lucide-react';

import type { 
  CutoutPiece, 
  CutoutSheet,
  SkeletonState 
} from '../engine/types';

interface CutoutGalleryProps {
  state: SkeletonState;
  setState: (updater: (prev: SkeletonState) => SkeletonState) => void;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
}

export const CutoutGallery: React.FC<CutoutGalleryProps> = ({ 
  state, 
  setState, 
  setStateWithHistory 
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Combine all pieces from all sheets
  const allPieces: Array<{ piece: CutoutPiece; sheet: CutoutSheet }> = [];
  Object.values(state.cutoutSheets || {}).forEach(sheet => {
    sheet.pieces.forEach(piece => {
      allPieces.push({ piece, sheet });
    });
  });

  const handleFileUpload = useCallback(async (files: FileList) => {
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
      
      // Validate and filter pieces
      const validatedPieces = Array.isArray(data.pieces) 
        ? data.pieces.filter((piece: any) => 
            piece && 
            typeof piece.id === 'string' &&
            typeof piece.x === 'number' &&
            typeof piece.y === 'number' &&
            typeof piece.width === 'number' &&
            typeof piece.height === 'number' &&
            typeof piece.src === 'string'
          ).map((piece: any) => ({
            id: piece.id,
            x: piece.x,
            y: piece.y,
            width: piece.width,
            height: piece.height,
            src: piece.src,
            autoAnchors: Array.isArray(piece.autoAnchors) ? piece.autoAnchors : []
          }))
        : [];
      
      // Create new sheet
      const newSheet: CutoutSheet = {
        id: `sheet_${Date.now()}`,
        name: `Sheet ${Object.keys(state.cutoutSheets || {}).length + 1}`,
        src: '', // Will be set by server
        width: 0,
        height: 0,
        pieces: validatedPieces,
        processedAt: Date.now(),
      };
      
      setStateWithHistory('add_cutout_sheet', (prev) => ({
        ...prev,
        cutoutSheets: {
          ...(prev.cutoutSheets || {}),
          [newSheet.id]: newSheet,
        }
      }));
      
      // Clear upload error on success
      setUploadError(null);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [state, setStateWithHistory]);

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

  const handlePieceClick = useCallback((piece: CutoutPiece, sheet: CutoutSheet) => {
    setSelectedPieceId(piece.id);
  }, []);

  const handlePieceDragStart = useCallback((e: any, piece: CutoutPiece, sheet: CutoutSheet) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'cutout_piece',
      pieceId: piece.id,
      sheetId: sheet.id,
    }));
    setSelectedPieceId(piece.id);
  }, []);

  const addPieceToCanvas = useCallback((piece: CutoutPiece, sheet: CutoutSheet) => {
    setStateWithHistory('add_piece_to_canvas', (prev) => {
      const editorState = prev.cutoutEditor;
      if (!editorState) return prev;
      
      const nodeId = `node_${Date.now()}`;
      
      const newNode = {
        id: nodeId,
        name: `${sheet.name} - ${piece.id}`,
        assetId: piece.id,
        transform: {
          x: Math.random() * 400 - 200,
          y: Math.random() * 300 - 150,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          flipX: false,
        },
        anchors: (piece.autoAnchors || []).map((pos, i) => ({
          id: `anchor_${nodeId}_${i}`,
          localPosition: pos,
          connectedTo: null,
          jointMapping: null,
          type: 'free' as const,
          visible: true,
        })),
        parent: null,
        children: [],
        visible: true,
        opacity: 1,
        zIndex: Object.keys(editorState.nodes).length,
        locked: false,
      };

      return {
        ...prev,
        cutoutEditor: {
          ...editorState,
          nodes: {
            ...editorState.nodes,
            [nodeId]: newNode,
          },
        },
      };
    });
  }, [setStateWithHistory]);

  return (
    <div className="flex flex-col h-full bg-[#1e1b17]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10 bg-[#252018]">
        <div className="flex items-center gap-2">
          <Grid3x3 size={16} className="text-white/60" />
          <span className="text-sm font-mono text-white/80 uppercase tracking-wider">
            Gallery
          </span>
        </div>
        <div className="text-xs text-[#c9a84c] font-mono">
          {allPieces.length} pieces
        </div>
      </div>

      {/* Upload Area */}
      <div className="p-3 border-b border-white/10">
        <div
          className={`relative min-h-[72px] rounded-lg border-2 border-dashed transition-colors ${
            dragActive 
              ? 'border-[#c9a84c] bg-[#c9a84c10]' 
              : 'border-white/20 bg-white/5 hover:border-white/30'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center justify-center h-full p-4 pointer-events-none">
            <Upload size={20} className="text-white/40 mb-2" />
            <p className="text-xs text-white/60 text-center">
              Drag & drop images here
            </p>
            <p className="text-xs text-white/40 text-center">
              or click to browse
            </p>
          </div>
        </div>
      </div>

      {/* Upload Error Display */}
      {uploadError && (
        <div className="mx-3 mt-2 p-2 bg-red-500/20 border border-red-500/50 rounded">
          <p className="text-xs text-red-200 text-center">
            {uploadError}
          </p>
        </div>
      )}

      {/* Pieces Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {allPieces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/40">
            <ImageIcon size={48} className="mb-3 opacity-50" />
            <p className="text-sm mb-1">No pieces yet</p>
            <p className="text-xs">Upload images to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <AnimatePresence>
              {allPieces.map(({ piece, sheet }) => (
                <motion.div
                  key={piece.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  className={`
                    group relative aspect-square bg-white/10 border rounded cursor-pointer
                    ${selectedPieceId === piece.id 
                      ? 'border-[#c9a84c] bg-[#c9a84c20]' 
                      : 'border-white/20 hover:border-white/40'
                    }
                  `}
                  onClick={() => handlePieceClick(piece, sheet)}
                  draggable
                  onDragStart={(e: React.DragEvent) => handlePieceDragStart(e, piece, sheet)}
                  onDragEnd={() => setSelectedPieceId(null)}
                >
                  {/* Thumbnail */}
                  <img
                    src={piece.thumbnail}
                    alt={piece.id}
                    className="w-full h-full object-contain p-2"
                    draggable={false}
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                  
                  {/* Anchor count badge */}
                  {piece.autoAnchors.length > 0 && (
                    <div className="absolute top-1 right-1 bg-[#c9a84c] text-black text-xs px-1.5 py-0.5 rounded font-mono">
                      {piece.autoAnchors.length}
                    </div>
                  )}
                  
                  {/* Suggested joints */}
                  {piece.suggestedJoints && piece.suggestedJoints.length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1">
                      <div className="bg-black/70 text-white text-xs px-1 py-0.5 rounded font-mono truncate">
                        {piece.suggestedJoints.join(', ')}
                      </div>
                    </div>
                  )}
                  
                  {/* Hover actions */}
                  <motion.div
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 focus:opacity-100"
                    whileHover={{ opacity: 1 }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addPieceToCanvas(piece, sheet);
                      }}
                      className="p-1.5 bg-[#c9a84c] text-black rounded hover:bg-[#c9a84c80] transition-colors"
                      title="Add to canvas"
                    >
                      <Plus size={12} />
                    </button>
                  </motion.div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Sheet List */}
      {Object.keys(state.cutoutSheets || {}).length > 0 && (
        <div className="p-3 border-t border-white/10">
          <div className="text-xs font-mono text-white/60 uppercase tracking-wider mb-2">
            Sheets
          </div>
          <div className="space-y-1">
            {Object.values(state.cutoutSheets || {}).map(sheet => (
              <div 
                key={sheet.id}
                className="flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/80 truncate">
                    {sheet.name}
                  </div>
                  <div className="text-xs text-white/50">
                    {sheet.pieces.length} pieces • {new Date(sheet.processedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  disabled
                  className="p-1 text-white/20 cursor-not-allowed opacity-50"
                  title="Sheet options (coming soon)"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
