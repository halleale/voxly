import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

export default async function RootPage() {
  const { userId } = await auth()
  if (userId) {
    redirect("/dashboard/feedback")
  }
  redirect("/sign-in")
}
