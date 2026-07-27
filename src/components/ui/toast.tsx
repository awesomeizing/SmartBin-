import { useState } from "react"
import { cn } from "@/lib/utils"
import { X, AlertTriangle, AlertCircle, Info } from "lucide-react"
import type { AlertSeverity } from "@/types"
import { useToast, type ToastItem } from "@/contexts/NotificationContext"

const iconMap: Record<AlertSeverity, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
};

const colorMap: Record<AlertSeverity, string> = {
  info: 'border-blue-500/30 bg-blue-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  critical: 'border-red-500/30 bg-red-500/5',
};

const iconColorMap: Record<AlertSeverity, string> = {
  info: 'text-blue-400',
  warning: 'text-amber-400',
  critical: 'text-red-400',
};

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = iconMap[toast.severity];

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl shadow-black/50 transition-all duration-300",
        colorMap[toast.severity],
        isExiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
      )}
      role="alert"
    >
      <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", iconColorMap[toast.severity])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{toast.message}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="text-zinc-500 hover:text-white transition-colors shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Toast container — renders at the bottom-right of the viewport */
export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-[380px] max-w-[calc(100vw-3rem)]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
