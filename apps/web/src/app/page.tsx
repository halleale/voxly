export const dynamic = 'force-dynamic'

import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

export default async function RootPage() {
  if (process.env.SKIP_AUTH === "true") {
    redirect("/dashboard/feedback")
  }
  const { userId } = await auth()
  if (userId) redirect("/dashboard/feedback")
  redirect("/sign-in")
}
