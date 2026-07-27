import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Inbox } from "lucide-react"
import { Button } from "./button"

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-5">
        {icon ?? <Inbox className="w-6 h-6 text-zinc-600" />}
      </div>
      <h3 className="text-base font-medium text-zinc-300 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-500 max-w-sm mb-6">{description}</p>
      )}
      {action && (
        <Button
          variant="outline"
          className="rounded-full px-6"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
