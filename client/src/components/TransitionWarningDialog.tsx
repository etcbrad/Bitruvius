import * as React from 'react';
import type { TransitionIssue } from '@/lib/transitionIssues';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const WARNINGS_DISABLED_KEY = 'bitruvius_transition_warnings_disabled';

const setWarningsDisabled = (disabled: boolean) => {
  try {
    localStorage.setItem(WARNINGS_DISABLED_KEY, disabled ? '1' : '0');
  } catch {
    // ignore
  }
};

export const getTransitionWarningsDisabled = (): boolean => {
  try {
    return localStorage.getItem(WARNINGS_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
};

export function TransitionWarningDialog(props: {
  open: boolean;
  issues: TransitionIssue[];
  onClose: () => void;
}) {
  const { open, issues, onClose } = props;
  const warnings = issues.filter((i) => i.severity === 'warning');

  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDontShowAgain(false);
  }, [open]);

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (dontShowAgain) setWarningsDisabled(true);
      onClose();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#111] border border-white/10 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Contradictory modes auto-corrected</AlertDialogTitle>
          <AlertDialogDescription className="text-[#aaa]">
            The engine detected conflicting settings and applied a safe correction.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {warnings.map((w, idx) => (
            <div key={`${w.title}-${idx}`} className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#ddd]">{w.title}</div>
              <div className="text-[11px] text-[#aaa] mt-1">{w.detail}</div>
              {w.autoFixedFields.length > 0 && (
                <div className="text-[10px] text-[#777] mt-2 font-mono">
                  Fixed: {w.autoFixedFields.join(', ')}
                </div>
              )}
            </div>
          ))}

          <label className="flex items-center gap-2 text-[11px] text-[#ccc] select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => {
                const v = e.target.checked;
                setDontShowAgain(v);
                if (v) setWarningsDisabled(true);
              }}
            />
            Don&apos;t show this warning again
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border border-white/15 text-white hover:bg-white/5">
            Close
          </AlertDialogCancel>
          <AlertDialogAction className="bg-white text-black hover:bg-white/90" onClick={onClose}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

