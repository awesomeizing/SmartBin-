import { cn } from "@/lib/utils"

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Switch({ checked, onChange, label, description, disabled, className, id }: SwitchProps) {
  const switchId = id ?? `switch-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {(label || description) && (
        <div className="flex-1 min-w-0 mr-4">
          {label && (
            <label htmlFor={switchId} className="text-sm font-medium text-zinc-200 cursor-pointer">
              {label}
            </label>
          )}
          {description && (
            <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
          )}
        </div>
      )}
      <button
        id={switchId}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-white" : "bg-white/10"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform duration-200",
            checked ? "translate-x-5 bg-zinc-950" : "translate-x-0 bg-zinc-500"
          )}
        />
      </button>
    </div>
  );
}
