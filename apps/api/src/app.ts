import Fastify from "fastify"
import cors from "@fastify/cors"
import sensible from "@fastify/sensible"
import authPlugin from "./plugins/auth"
import dbPlugin from "./plugins/db"
import health from "./routes/health"
import feedback from "./routes/feedback"
import inbox from "./routes/inbox"
import webhooks from "./routes/webhooks"
import connectors from "./routes/connectors"
import themes from "./routes/themes"
import actions from "./routes/actions"
import jira from "./routes/jira"

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
  })

  await app.register(cors, {
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  })

  await app.register(sensible)
  await app.register(dbPlugin)
  await app.register(authPlugin)
  await app.register(health)
  await app.register(feedback)
  await app.register(inbox)
  await app.register(webhooks)
  await app.register(connectors)
  await app.register(themes)
  await app.register(actions)
  await app.register(jira)

  app.setErrorHandler((err: unknown, _request, reply) => {
    app.log.error(err)
    const e = err as { statusCode?: number; message?: string; code?: string }
    reply.code(e.statusCode ?? 500).send({
      error: e.message ?? "Internal server error",
      code: e.code ?? "INTERNAL_ERROR",
    })
  })

  return app
}
