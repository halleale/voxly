import { auth } from "@clerk/nextjs/server"

const DEV_CLERK_USER_ID = "seed_owner"

if (process.env.SKIP_AUTH === "true" && process.env.NODE_ENV === "production") {
  throw new Error(
    "SKIP_AUTH must not be set in production. Remove it from your environment variables.",
  )
}

export async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}
