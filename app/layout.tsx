import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '🇮🇹 Italian Learning Platform',
  description: 'Modern Italian language learning platform with vocabulary browser and frequency analyzer',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
