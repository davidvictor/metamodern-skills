/** Serialisable clock formatting for range inputs. `time` is minutes; `time-hours` is decimal 24-hour time. */
export function formatClock(value: number, format: "time" | "time-hours" = "time") {
  const sourceMinutes = format === "time-hours" ? value * 60 : value
  const minutes = ((Math.round(sourceMinutes) % 1440) + 1440) % 1440
  const hour = Math.floor(minutes / 60) % 12 || 12
  return `${hour}:${String(minutes % 60).padStart(2, "0")} ${minutes < 720 ? "AM" : "PM"}`
}
