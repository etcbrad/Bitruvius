import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown } from 'lucide-react';

export interface WheelPanelProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

export const WheelPanel: React.FC<WheelPanelProps> = ({
  title,
  isOpen,
  onToggle,
  children,
  className = '',
}) => {
  return (
    <div className={`wheel-panel ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 bg-[#222] hover:bg-[#333] rounded-lg transition-colors text-left"
        aria-expanded={isOpen}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ddd]">
          {title}
        </span>
        <ChevronDown
          size={12}
          className={`text-[#666] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
