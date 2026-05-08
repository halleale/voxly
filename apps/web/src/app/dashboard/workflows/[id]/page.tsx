import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@voxly/db"
import { WorkflowBuilder } from "./workflow-builder"

export default async function WorkflowBuilderPage({ params }: { params: { id: string } }) {
  const { orgId } = await auth()
  if (!orgId) redirect("/onboarding")

  const workspace = await prisma.workspace.findFirst({
    where: { slug: orgId },
    select: { id: true },
  })
  if (!workspace) redirect("/onboarding")

  const workflow = await prisma.workflow.findFirst({
    where: { id: params.id, workspaceId: workspace.id },
  })
  if (!workflow) notFound()

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, clerkUserId: true, role: true },
  })

  const recentFeedback = await prisma.feedbackItem.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { ingestedAt: "desc" },
    take: 10,
    select: { id: true, extractedSummary: true, verbatimText: true, sourceType: true },
  })

  return (
    <WorkflowBuilder
      workflow={{
        id: workflow.id,
        name: workflow.name,
        isActive: workflow.isActive,
        graphJson: workflow.graphJson as object,
      }}
      workspaceId={workspace.id}
      members={members}
      recentFeedback={recentFeedback.map((f: { id: string; extractedSummary: string | null; verbatimText: string; sourceType: string }) => ({
        id: f.id,
        label: f.extractedSummary ?? f.verbatimText.slice(0, 80),
        sourceType: f.sourceType,
      }))}
    />
  )
}
