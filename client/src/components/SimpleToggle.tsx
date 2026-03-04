import { ToggleLeft, ToggleRight } from 'lucide-react';

export function SimpleToggle(props: { label: string; active: boolean; onClick: () => void }) {
  const { label, active, onClick } = props;
  return (
    <button
      onClick={onClick}
      type="button"
      aria-pressed={active}
      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
        active ? 'bg-white text-black border-white' : 'bg-transparent text-[#666] border-[#222] hover:border-[#444]'
      }`}
    >
      <span className="text-[11px] font-bold uppercase tracking-tight">{label}</span>
      {active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
    </button>
  );
}

