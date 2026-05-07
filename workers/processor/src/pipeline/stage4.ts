import { classifyFeedback } from "@voxly/ai"
import type { ClassifyResult } from "@voxly/ai"

export type Stage4Decision = "APPROVED" | "REJECTED" | "UNCERTAIN"

export async function runStage4(text: string): Promise<Stage4Decision> {
  const result: ClassifyResult = await classifyFeedback(text)
  if (result === "feedback") return "APPROVED"
  if (result === "not_feedback") return "REJECTED"
  return "UNCERTAIN"
}
