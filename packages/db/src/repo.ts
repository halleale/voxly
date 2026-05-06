import {
  type PrismaClient,
  type Prisma,
  type FeedbackItem,
} from "@prisma/client"

/**
 * Application-level workspace isolation.
 *
 * Every method on this repo automatically scopes queries to the given
 * workspaceId — equivalent to Postgres RLS but enforced in the app layer
 * where Prisma connection pooling doesn't fight us.
 *
 * Usage:
 *   const repo = createRepo(prisma, workspaceId)
 *   const items = await repo.feedbackItem.findMany({ where: { status: "NEW" } })
 */
export function createRepo(prisma: PrismaClient, workspaceId: string) {
  return {
    feedbackItem: {
      findMany(
        args: Omit<Prisma.FeedbackItemFindManyArgs, "where"> & {
          where?: Omit<Prisma.FeedbackItemWhereInput, "workspaceId">
        } = {}
      ): Promise<FeedbackItem[]> {
        const { where, ...rest } = args
        return prisma.feedbackItem.findMany({
          ...rest,
          where: { ...where, workspaceId },
        })
      },

      findFirst(
        args: Omit<Prisma.FeedbackItemFindFirstArgs, "where"> & {
          where?: Omit<Prisma.FeedbackItemWhereInput, "workspaceId">
        } = {}
      ) {
        const { where, ...rest } = args
        return prisma.feedbackItem.findFirst({
          ...rest,
          where: { ...where, workspaceId },
        })
      },

      count(
        args: {
          where?: Omit<Prisma.FeedbackItemWhereInput, "workspaceId">
        } = {}
      ) {
        const { where, ...rest } = args
        return prisma.feedbackItem.count({
          ...rest,
          where: { ...where, workspaceId },
        })
      },

      update(
        id: string,
        data: Prisma.FeedbackItemUpdateInput
      ) {
        return prisma.feedbackItem.update({
          where: { id, workspaceId },
          data,
        })
      },
    },

    theme: {
      findMany(
        args: Omit<Prisma.ThemeFindManyArgs, "where"> & {
          where?: Omit<Prisma.ThemeWhereInput, "workspaceId">
        } = {}
      ) {
        const { where, ...rest } = args
        return prisma.theme.findMany({
          ...rest,
          where: { ...where, workspaceId },
        })
      },
    },

    customer: {
      findMany(
        args: Omit<Prisma.CustomerFindManyArgs, "where"> & {
          where?: Omit<Prisma.CustomerWhereInput, "workspaceId">
        } = {}
      ) {
        const { where, ...rest } = args
        return prisma.customer.findMany({
          ...rest,
          where: { ...where, workspaceId },
        })
      },
    },

    connector: {
      findMany(
        args: Omit<Prisma.ConnectorFindManyArgs, "where"> & {
          where?: Omit<Prisma.ConnectorWhereInput, "workspaceId">
        } = {}
      ) {
        const { where, ...rest } = args
        return prisma.connector.findMany({
          ...rest,
          where: { ...where, workspaceId },
        })
      },
    },

    view: {
      findMany(
        args: Omit<Prisma.ViewFindManyArgs, "where"> & {
          where?: Omit<Prisma.ViewWhereInput, "workspaceId">
        } = {}
      ) {
        const { where, ...rest } = args
        return prisma.view.findMany({
          ...rest,
          where: { ...where, workspaceId },
          orderBy: args.orderBy ?? { position: "asc" },
        })
      },
    },

    workflow: {
      findMany(
        args: Omit<Prisma.WorkflowFindManyArgs, "where"> & {
          where?: Omit<Prisma.WorkflowWhereInput, "workspaceId">
        } = {}
      ) {
        const { where, ...rest } = args
        return prisma.workflow.findMany({
          ...rest,
          where: { ...where, workspaceId },
        })
      },
    },
  }
}

export type WorkspaceRepo = ReturnType<typeof createRepo>
