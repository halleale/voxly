import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "@voxly/db",
    environment: "node",
    globals: true,
  },
})
