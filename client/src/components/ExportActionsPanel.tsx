import React from 'react';
import { Copy, FileText, Image, Layers, Video, Film } from 'lucide-react';

export type ExportAction = {
  id: string;
  label: string;
  title: string;
  icon?: React.ReactNode;
  onClick: () => Promise<void> | void;
};

type ExportActionsPanelProps = {
  actions: ExportAction[];
  lastStatus?: string;
};

const iconMap: Record<string, React.ReactNode> = {
  code: <Copy size={16} />,
  file: <FileText size={16} />,
  png: <Image size={16} />,
  svg: <Layers size={16} />,
  video: <Video size={16} />,
  gif: <Film size={16} />,
};

export const ExportActionsPanel: React.FC<ExportActionsPanelProps> = ({ actions, lastStatus }) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.4em] text-[#666]">Export</div>
        {lastStatus && <span className="text-[9px] text-[#aaa] uppercase tracking-[0.3em]">{lastStatus}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            title={action.title}
            className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 transition-all hover:border-white/40"
          >
            <span className="text-white/70">{iconMap[action.id] ?? action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};
