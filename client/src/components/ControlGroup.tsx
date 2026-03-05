import React from 'react';

export interface ControlGroupProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const ControlGroup: React.FC<ControlGroupProps> = ({
  title,
  children,
  className = '',
}) => {
  return (
    <div className={`control-group ${className}`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-2">
        {title}
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
};
