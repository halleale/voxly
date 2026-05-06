import Fastify from "fastify"
import cors from "@fastify/cors"
import sensible from "@fastify/sensible"
import authPlugin from "./plugins/auth.js"
import dbPlugin from "./plugins/db.js"
import health from "./routes/health.js"
import feedback from "./routes/feedback.js"

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
