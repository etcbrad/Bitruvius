import type { Dispatch, SetStateAction } from 'react';

export type EditorMode = 'Edit' | 'Pose' | 'Animate';

export function ModeToolbar(props: { mode: EditorMode; setMode: Dispatch<SetStateAction<EditorMode>> }) {
  const { mode, setMode } = props;

  const Button = (args: { id: EditorMode; label: string }) => {
    const active = mode === args.id;
    return (
      <button
        type="button"
        onClick={() => setMode(args.id)}
        className={`px-3 py-1 text-xs rounded-md border transition-colors ${
          active ? 'bg-white text-black border-white' : 'bg-black/20 text-white border-white/15 hover:bg-white/10'
        }`}
      >
        {args.label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Button id="Edit" label="Edit" />
      <Button id="Pose" label="Pose" />
      <Button id="Animate" label="Animate" />
    </div>
  );
}

