import { buildApp } from "./app.js"

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? "0.0.0.0"

async function start() {
  const app = await buildApp()
  await app.listen({ port: PORT, host: HOST })
  console.log(`API running at http://localhost:${PORT}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
