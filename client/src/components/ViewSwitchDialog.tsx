import * as React from 'react';
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

export type ViewSwitchChoice = 'apply_all' | 'camera_reference_only';

const PROMPT_DISABLED_KEY = 'bitruvius_view_switch_prompt_disabled';
const DEFAULT_CHOICE_KEY = 'bitruvius_view_switch_default_choice';

export const getViewSwitchPromptDisabled = (): boolean => {
  try {
    return localStorage.getItem(PROMPT_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
};

export const getViewSwitchDefaultChoice = (): ViewSwitchChoice => {
  try {
    const raw = localStorage.getItem(DEFAULT_CHOICE_KEY);
    return raw === 'camera_reference_only' ? 'camera_reference_only' : 'apply_all';
  } catch {
    return 'apply_all';
  }
};

const setPromptDisabled = (disabled: boolean) => {
  try {
    localStorage.setItem(PROMPT_DISABLED_KEY, disabled ? '1' : '0');
  } catch {
    // ignore
  }
};

const setDefaultChoice = (choice: ViewSwitchChoice) => {
  try {
    localStorage.setItem(DEFAULT_CHOICE_KEY, choice);
  } catch {
    // ignore
  }
};

export function ViewSwitchDialog(props: {
  open: boolean;
  fromName: string;
  toName: string;
  onCancel: () => void;
  onChoose: (choice: ViewSwitchChoice) => void;
  onSaveThenChoose?: (choice: ViewSwitchChoice) => void;
}) {
  const { open, fromName, toName, onCancel, onChoose, onSaveThenChoose } = props;

  const [dontAskAgain, setDontAskAgain] = React.useState(false);
  const [rememberChoice, setRememberChoice] = React.useState<ViewSwitchChoice>('apply_all');

  React.useEffect(() => {
    if (!open) return;
    setDontAskAgain(false);
    setRememberChoice(getViewSwitchDefaultChoice());
  }, [open]);

  const choose = (choice: ViewSwitchChoice, saveCurrent: boolean) => {
    if (dontAskAgain) setPromptDisabled(true);
    setDefaultChoice(choice);
    if (saveCurrent && onSaveThenChoose) onSaveThenChoose(choice);
    else onChoose(choice);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => (!v ? onCancel() : null)}>
      <AlertDialogContent className="bg-[#111] border border-white/10 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Switch view preset?</AlertDialogTitle>
          <AlertDialogDescription className="text-[#aaa]">
            Switching from <span className="text-white font-semibold">{fromName}</span> to{' '}
            <span className="text-white font-semibold">{toName}</span> can overwrite pose, camera, and reference layers.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#ddd] mb-2">Apply</div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => choose('apply_all', false)}
                className="w-full py-2 rounded-lg text-[11px] font-bold uppercase bg-white text-black hover:bg-white/90 transition-colors"
              >
                Apply Pose + Camera + Reference
              </button>
              <button
                type="button"
                onClick={() => choose('camera_reference_only', false)}
                className="w-full py-2 rounded-lg text-[11px] font-bold uppercase bg-[#222] hover:bg-[#2a2a2a] transition-colors"
              >
                Camera + Reference Only
              </button>
              {onSaveThenChoose && (
                <button
                  type="button"
                  onClick={() => choose(rememberChoice, true)}
                  className="w-full py-2 rounded-lg text-[11px] font-bold uppercase bg-[#222] hover:bg-[#2a2a2a] transition-colors"
                >
                  Save Current View, Then Switch
                </button>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-[#ccc] select-none">
            <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)} />
            Don&apos;t ask again (use last choice)
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border border-white/15 text-white hover:bg-white/5" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction className="bg-white text-black hover:bg-white/90" onClick={() => choose(rememberChoice, false)}>
            Use Default ({rememberChoice === 'apply_all' ? 'Apply All' : 'Camera Only'})
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

