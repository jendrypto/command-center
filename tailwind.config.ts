import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0a0f',
          800: '#12121a',
          700: '#1a1a25',
          600: '#252535',
          500: '#353545',
        },
        category: {
          ideas: '#3b82f6',
          conversations: '#22c55e',
          research: '#a855f7',
          bookmarks: '#f97316',
        },
      },
    },
  },
  plugins: [],
}
export default config
