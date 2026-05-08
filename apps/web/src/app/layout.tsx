import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import "@/styles/globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "Voxly — Product Feedback Intelligence",
  description: "Aggregate, filter, and act on customer feedback from every source.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  )
}
