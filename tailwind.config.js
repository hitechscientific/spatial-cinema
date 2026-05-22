/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/popup/index.html",
    "./src/popup/**/*.{js,ts,jsx,tsx}",
    "./src/offscreen/**/*.{js,ts,html}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          950: '#06060c',
          900: '#0a0b16',
          800: '#121324',
          700: '#1d1e38',
          600: '#2a2c4e',
          500: '#43467b',
          glow: '#00f2fe',
          neon: '#9b51e0',
          accent: '#ff007a'
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'glow-cyan': '0 0 15px rgba(0, 242, 254, 0.4)',
        'glow-neon': '0 0 15px rgba(155, 81, 224, 0.4)',
        'glow-accent': '0 0 15px rgba(255, 0, 122, 0.4)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      }
    },
  },
  plugins: [],
}
