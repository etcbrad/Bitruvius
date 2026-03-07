import React, { useState, useCallback, useRef } from 'react';
import { Upload, X } from 'lucide-react';

export type MediaUploadPanelProps = {
  title: string;
  description: string;
  supportedTypes: string;
  currentLabel: string | null;
  status?: string;
  visible?: boolean;
  onUpload: (file: File) => Promise<void> | void;
  onClear: () => void;
  disabled?: boolean;
};

export const MediaUploadPanel: React.FC<MediaUploadPanelProps> = ({
  title,
  description,
  supportedTypes,
  currentLabel,
  status,
  visible = false,
  onUpload,
  onClear,
  disabled = false,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setPendingFile(file.name);
      void onUpload(file);
      event.target.value = '';
    },
    [onUpload],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      if (disabled) return;
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      setPendingFile(file.name);
      void onUpload(file);
    },
    [disabled, onUpload],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    setDragActive(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-[#666]">{title}</div>
          <div className="text-sm text-white/70">{description}</div>
        </div>
        {visible && (
          <button
            type="button"
            onClick={onClear}
            className="p-2 rounded-full border border-white/10 text-white/70 hover:border-white/40"
            title="Clear current media"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div
        className={`relative min-h-[88px] rounded-2xl border-2 border-dashed ${
          dragActive ? 'border-[#F27D26]' : 'border-white/10'
        } bg-white/5 flex flex-col items-center justify-center text-[10px] tracking-[0.4em] text-white/60`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload size={24} className="text-white/40" />
        <p className="mt-2 text-[11px] text-white/80">Drag & drop</p>
        <p className="text-[9px] text-white/40">{supportedTypes}</p>
        <button
          type="button"
          onClick={handleSelectClick}
          className="mt-4 px-4 py-2 rounded-full bg-white text-black text-[10px] font-bold uppercase tracking-[0.3em] transition-colors disabled:opacity-40"
          disabled={disabled}
        >
          Choose file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={supportedTypes}
          className="hidden"
          onChange={handleChange}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-white/50">
        <span>{currentLabel ?? 'No media loaded'}</span>
        <span>{status ?? 'Awaiting upload'}</span>
      </div>
    </div>
  );
};
