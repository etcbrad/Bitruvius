import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function HelpTip({ text }: { text: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/10 text-[10px] font-bold text-[#777] hover:text-white hover:border-white/20"
            aria-label="Help"
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

