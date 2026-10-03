/** The shell's tokens as CSS values, for module styles that need them outside Tailwind classes. */
export const tokens = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  border: "var(--border)",
  ring: "var(--ring)",
  stage: "var(--stage)",
  success: "var(--success)",
  successSurface: "var(--success-surface)",
  warning: "var(--warning)",
  warningSurface: "var(--warning-surface)",
  info: "var(--info)",
  infoSurface: "var(--info-surface)",
  danger: "var(--danger)",
  dangerSurface: "var(--danger-surface)",
} as const
