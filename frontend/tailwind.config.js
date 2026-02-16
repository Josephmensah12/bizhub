/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          700: '#1a2332',
          800: '#151d2b',
          900: '#101824',
        },
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        accent: {
          green: '#10b981',
          blue: '#3b82f6',
          orange: '#f59e0b',
          red: '#ef4444',
          purple: '#8b5cf6',
          teal: '#14b8a6',
        },
      },
    },
  },
  plugins: [],
}
