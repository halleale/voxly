/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ["@voxly/db", "@voxly/types"],
  // When no Clerk publishable key is present (e.g. CI / Docker build), fall
  // back to SKIP_AUTH mode so prerendering doesn't throw a missing-key error.
  env: {
    SKIP_AUTH: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? undefined : "true",
  },
}

export default config
