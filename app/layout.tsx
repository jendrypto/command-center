import type { Metadata, Viewport } from 'next'
import './globals.css'
import PWARegistration from '@/components/PWARegistration'
import config from '@/command-space.config'

export const metadata: Metadata = {
  title: config.dashboard.title,
  description: `${config.agent.name}'s workspace for ideas, conversations, and research.`,
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-dark-900 text-white min-h-screen">
        <PWARegistration />
        {children}
      </body>
    </html>
  )
}
