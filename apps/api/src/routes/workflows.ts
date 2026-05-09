import type { FastifyPluginAsync } from "fastify"
import { prisma } from "@voxly/db"
import { createWorkflowExecutionQueue, createRedisConnection } from "@voxly/queue"
import type { WorkflowGraph } from "@voxly/types"

interface WorkflowBody {
  name: string
  graphJson?: WorkflowGraph
  isActive?: boolean
}

interface TestRunBody {
  feedbackItemId: string
}

const wfQueue = createWorkflowExecutionQueue(createRedisConnection())

const workflows: FastifyPluginAsync = async (fastify) => {
  // List workflows
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/workflows",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      const rows = await prisma.workflow.findMany({
        where: { workspaceId: request.workspaceId },
        orderBy: { createdAt: "desc" },
      })
      return rows
    }
  )

  // Get single workflow
  fastify.get<{ Params: { workspaceId: string; workflowId: string } }>(
    "/api/workspaces/:workspaceId/workflows/:workflowId",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      const wf = await prisma.workflow.findFirst({
        where: { id: request.params.workflowId, workspaceId: request.workspaceId },
        include: { runs: { orderBy: { startedAt: "desc" }, take: 20 } },
      })
      if (!wf) return reply.code(404).send({ error: "Not found", code: "NOT_FOUND" })
      return wf
    }
  )

  // Create workflow
  fastify.post<{ Params: { workspaceId: string }; Body: WorkflowBody }>(
    "/api/workspaces/:workspaceId/workflows",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      const { name, graphJson, isActive } = request.body
      if (!name?.trim()) return reply.code(400).send({ error: "name required", code: "VALIDATION" })
      const wf = await prisma.workflow.create({
        data: {
          workspaceId: request.workspaceId,
          name: name.trim(),
          graphJson: graphJson ?? { nodes: [], edges: [] },
          isActive: isActive ?? false,
        },
      })
      return reply.code(201).send(wf)
    }
  )

  // Update workflow (save canvas)
  fastify.patch<{ Params: { workspaceId: string; workflowId: string }; Body: Partial<WorkflowBody> }>(
    "/api/workspaces/:workspaceId/workflows/:workflowId",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      const existing = await prisma.workflow.findFirst({
        where: { id: request.params.workflowId, workspaceId: request.workspaceId },
      })
      if (!existing) return reply.code(404).send({ error: "Not found", code: "NOT_FOUND" })

      const { name, graphJson, isActive } = request.body
      const updated = await prisma.workflow.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(graphJson !== undefined && { graphJson }),
          ...(isActive !== undefined && { isActive }),
        },
      })
      return updated
    }
  )

  // Delete workflow
  fastify.delete<{ Params: { workspaceId: string; workflowId: string } }>(
    "/api/workspaces/:workspaceId/workflows/:workflowId",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      const existing = await prisma.workflow.findFirst({
        where: { id: request.params.workflowId, workspaceId: request.workspaceId },
      })
      if (!existing) return reply.code(404).send({ error: "Not found", code: "NOT_FOUND" })
      await prisma.workflow.delete({ where: { id: existing.id } })
      return reply.code(204).send()
    }
  )

  // Test run — queue a workflow against a specific feedback item (testRun flag = no persistent WorkflowRun)
  fastify.post<{ Params: { workspaceId: string; workflowId: string }; Body: TestRunBody }>(
    "/api/workspaces/:workspaceId/workflows/:workflowId/test-run",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      const { feedbackItemId } = request.body
      if (!feedbackItemId) return reply.code(400).send({ error: "feedbackItemId required" })

      const [wf, feedbackItem] = await Promise.all([
        prisma.workflow.findFirst({
          where: { id: request.params.workflowId, workspaceId: request.workspaceId },
        }),
        prisma.feedbackItem.findFirst({
          where: { id: feedbackItemId, workspaceId: request.workspaceId },
          select: { id: true },
        }),
      ])
      if (!wf) return reply.code(404).send({ error: "Not found", code: "NOT_FOUND" })
      if (!feedbackItem) return reply.code(404).send({ error: "Feedback item not found", code: "NOT_FOUND" })

      const job = await wfQueue.add("EXECUTE_WORKFLOW", {
        workflowId: wf.id,
        workspaceId: request.workspaceId,
        feedbackItemId,
        testRun: true,
      })
      return { jobId: job.id }
    }
  )

  // Get workflow runs
  fastify.get<{ Params: { workspaceId: string; workflowId: string } }>(
    "/api/workspaces/:workspaceId/workflows/:workflowId/runs",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      const runs = await prisma.workflowRun.findMany({
        where: { workflow: { id: request.params.workflowId, workspaceId: request.workspaceId } },
        orderBy: { startedAt: "desc" },
        take: 50,
      })
      return runs
    }
  )
}

export default workflows
