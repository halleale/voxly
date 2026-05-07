import type { Job, Queue } from "bullmq"
import type { PrismaClient } from "@voxly/db"
import type { AiPipelineJob, CrmEnrichJob } from "@voxly/queue"
import { JOB_CRM_ENRICH } from "@voxly/queue"
import { scoreSentiment, inferSeverity, generateSummary } from "@voxly/ai"
import { assignTheme } from "./theme-assign"

export async function handleAiPipeline(
  job: Job<AiPipelineJob>,
  prisma: PrismaClient,
  aiQueue: Queue
) {
  const { feedbackItemId, workspaceId } = job.data

  const item = await prisma.feedbackItem.findUnique({
    where: { id: feedbackItemId },
    include: {
      customer: { select: { name: true, tier: true, arrCents: true } },
      theme: { select: { slug: true, name: true } },
    },
  })
  if (!item) return

  // 1. Sentiment
  const sentiment = await scoreSentiment(item.verbatimText)

  // 2. Severity (uses customer context if available)
  const severity = await inferSeverity({
    text: item.verbatimText,
    sentiment,
    customerTier: item.customer?.tier ?? undefined,
    arrCents: item.customer?.arrCents ?? undefined,
  })

  // 3. AI Summary card
  const extractedSummary = await generateSummary({
    verbatimText: item.verbatimText,
    authorName: item.authorName ?? undefined,
    customerName: item.customer?.name ?? undefined,
    customerTier: item.customer?.tier ?? undefined,
    arrCents: item.customer?.arrCents ?? undefined,
    themeName: item.theme?.slug ?? undefined,
    sourceType: item.sourceType,
    sentiment,
  })

  // 4. Theme assignment — nearest centroid in pgvector
  await assignTheme(prisma, feedbackItemId, workspaceId)

  await prisma.feedbackItem.update({
    where: { id: feedbackItemId },
    data: {
      sentiment,
      severity,
      extractedSummary: extractedSummary || undefined,
    },
  })

  // 5. Enqueue CRM enrichment if author email is known
  if (item.authorEmail) {
    const crmJob: CrmEnrichJob = {
      feedbackItemId,
      workspaceId,
      authorEmail: item.authorEmail,
      authorDomain: item.authorEmail.split("@")[1],
    }
    await aiQueue.add(JOB_CRM_ENRICH, crmJob)
  }
}
