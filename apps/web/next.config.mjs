/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ["@voxly/db", "@voxly/types", "@voxly/queue"],
}

export default config
