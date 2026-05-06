import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAge(date: Date | null | undefined): string {
  if (!date) return "—"
  const ms = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function formatArr(arrCents: number | null | undefined): string {
  if (!arrCents) return ""
  const dollars = arrCents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}k`
  return `$${dollars}`
}

export function formatSentiment(score: number | null | undefined): string {
  if (score == null) return "—"
  return score.toFixed(2)
}
