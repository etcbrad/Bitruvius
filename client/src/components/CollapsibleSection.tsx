import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type CollapsibleSectionProps = {
  title: React.ReactNode;
  storageKey?: string;
  defaultOpen?: boolean;
  keepMounted?: boolean;
  className?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
};

const safeReadBool = (key: string): boolean | null => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
};

const safeWriteBool = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // no-op
  }
};

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  storageKey,
  defaultOpen = true,
  keepMounted = true,
  className = '',
  headerRight,
  children,
}) => {
  const initialOpen = useMemo(() => {
    if (!storageKey) return defaultOpen;
    const saved = safeReadBool(storageKey);
    return saved ?? defaultOpen;
  }, [defaultOpen, storageKey]);

  const [open, setOpen] = useState<boolean>(initialOpen);

  useEffect(() => {
    if (!storageKey) return;
    safeWriteBool(storageKey, open);
  }, [open, storageKey]);

  return (
    <section className={`rounded-xl bg-white/5 border border-white/10 ${className}`}>
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="min-w-0 flex items-center gap-2 text-left text-[10px] font-bold uppercase tracking-widest text-[#666] hover:text-[#bbb] transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
          <span className="truncate">{title}</span>
        </button>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>

      {(open || keepMounted) && <div className={`${open ? 'block' : 'hidden'} px-3 pb-3`}>{children}</div>}
    </section>
  );
};

