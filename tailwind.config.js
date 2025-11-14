/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './public/**/*.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        brand: {
          50: '#f5f9ff',
          100: '#e6f0ff',
          200: '#bfd6ff',
          300: '#94baff',
          400: '#6694ff',
          500: '#3e6dff',
          600: '#1e47ff',
          700: '#1637cc',
          800: '#112999',
          900: '#0b1c66',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}

