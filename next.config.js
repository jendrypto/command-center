/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this project so Turbopack doesn't walk up the
  // directory tree and pick up a stray package-lock.json in an ancestor
  // directory. Required on Next.js 16+ when the repo lives inside a path
  // that has ancestor lockfiles.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
