import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRepo } from "../repo.js"
import type { PrismaClient } from "@prisma/client"

// Minimal mock of the Prisma client
function makeMockPrisma() {
  return {
    feedbackItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
    },
    theme: { findMany: vi.fn().mockResolvedValue([]) },
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    connector: { findMany: vi.fn().mockResolvedValue([]) },
    view: { findMany: vi.fn().mockResolvedValue([]) },
    workflow: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient
}

describe("createRepo", () => {
  const workspaceId = "ws_test_123"
  let prisma: PrismaClient
  let repo: ReturnType<typeof createRepo>

  beforeEach(() => {
    prisma = makeMockPrisma()
    repo = createRepo(prisma, workspaceId)
  })

  it("always injects workspaceId into feedbackItem.findMany", async () => {
    await repo.feedbackItem.findMany({ where: { status: "NEW" } })
    expect(prisma.feedbackItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId }) })
    )
  })

  it("merges caller where clause with workspaceId", async () => {
    await repo.feedbackItem.findMany({ where: { severity: "HIGH" } })
    expect(prisma.feedbackItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { severity: "HIGH", workspaceId },
      })
    )
  })

  it("works with no arguments", async () => {
    await repo.feedbackItem.findMany()
    expect(prisma.feedbackItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId } })
    )
  })

  it("always injects workspaceId into feedbackItem.count", async () => {
    await repo.feedbackItem.count({ where: { status: "ASSIGNED" } })
    expect(prisma.feedbackItem.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId }) })
    )
  })

  it("scopes update to workspaceId", async () => {
    await repo.feedbackItem.update("item_1", { status: "RESOLVED" })
    expect(prisma.feedbackItem.update).toHaveBeenCalledWith({
      where: { id: "item_1", workspaceId },
      data: { status: "RESOLVED" },
    })
  })

  it("prevents cross-workspace access by always binding the supplied workspaceId", async () => {
    const repo2 = createRepo(prisma, "ws_other_456")
    await repo2.feedbackItem.findMany()
    expect(prisma.feedbackItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws_other_456" } })
    )
    // Original repo still uses its own workspaceId
    await repo.feedbackItem.findMany()
    expect(prisma.feedbackItem.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { workspaceId } })
    )
  })
})
