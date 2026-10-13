import * as React from "react"
import { cn } from "@/lib/utils"
import type { AlertSeverity, BinStatus } from "@/types"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
}

const variantStyles: Record<string, string> = {
  default: 'bg-white/10 text-zinc-300 border-white/10',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  outline: 'bg-transparent text-zinc-400 border-white/10',
};

function Badge({ className, variant = 'default', size = 'sm', dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-mono uppercase tracking-wider whitespace-nowrap",
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: 'currentColor' }}
            />
          )}
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'currentColor' }}
          />
        </span>
      )}
      {children}
    </span>
  )
}

/** Severity-colored badge for alerts */
function SeverityBadge({ severity, className, ...props }: { severity: AlertSeverity } & React.HTMLAttributes<HTMLSpanElement>) {
  const variant = severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'info';
  return (
    <Badge variant={variant} dot pulse={severity === 'critical'} className={className} {...props}>
      {severity}
    </Badge>
  )
}

/** Status badge for bin status */
function StatusBadge({ status, className, ...props }: { status: BinStatus } & React.HTMLAttributes<HTMLSpanElement>) {
  const variant = status === 'Full' ? 'danger' : status === 'Half' ? 'warning' : 'success';
  return (
    <Badge variant={variant} dot className={className} {...props}>
      {status}
    </Badge>
  )
}

/** Online/Offline indicator badge */
function OnlineBadge({ online, className, ...props }: { online: boolean } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <Badge variant={online ? 'success' : 'danger'} dot pulse={online} className={className} {...props}>
      {online ? 'Online' : 'Offline'}
    </Badge>
  )
}

/** Source provenance badge — clearly distinguishes LIVE IoT from DEMO DATA */
function SourceBadge({ source, className, ...props }: { source: 'device' | 'simulated' | 'placeholder' } & React.HTMLAttributes<HTMLSpanElement>) {
  const variant = source === 'device' ? 'success' : source === 'simulated' ? 'warning' : 'default';
  const label = source === 'device' ? 'LIVE IoT' : source === 'simulated' ? 'DEMO DATA' : 'N/A';
  return (
    <Badge variant={variant} dot={source === 'device'} pulse={source === 'device'} className={className} {...props}>
      {label}
    </Badge>
  )
}

export { Badge, SeverityBadge, StatusBadge, OnlineBadge, SourceBadge }
