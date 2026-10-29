import type { Priority, Status } from "./validation";

/** Target hours to first attention per priority. Used only to flag overdue tickets in the queue. */
export const SLA_HOURS: Record<Priority, number> = { Critical: 8, High: 24, Medium: 72, Low: 168 };

export const isUnresolved = (s: Status) => s === "Open" || s === "In Progress";

export const ageHours = (createdAt: string, now = Date.now()) => (now - new Date(createdAt).getTime()) / 3_600_000;

export const isOverdue = (t: { status: Status; priority: Priority; createdAt: string }, now = Date.now()) =>
  isUnresolved(t.status) && ageHours(t.createdAt, now) > SLA_HOURS[t.priority];

export function formatAge(createdAt: string, now = Date.now()): string {
  const h = ageHours(createdAt, now);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
