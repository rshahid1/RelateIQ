/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        // Signature — deep emerald-teal (jewel tone)
        brand: {
          50: '#eef6f3',
          100: '#d5eae2',
          200: '#aed6c8',
          300: '#7cbca8',
          500: '#1f8a6d',
          600: '#176b54',
          700: '#125443',
        },
        // Champagne gold — premium accents, used sparingly
        gold: {
          100: '#f6ecd4',
          200: '#ecdcb2',
          400: '#cca85e',
          500: '#b8923f',
        },
        // Warm greige neutrals (override cool gray everywhere)
        gray: {
          50: '#f8f7f3',
          100: '#efece4',
          200: '#e5e0d5',
          300: '#d4ccbd',
          400: '#a8a08e',
          500: '#7c7361',
          600: '#5a5346',
          700: '#443f35',
          800: '#2b2820',
          900: '#1a1813',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(41,37,30,0.04), 0 6px 20px -6px rgba(41,37,30,0.08)',
        lift: '0 4px 12px -2px rgba(41,37,30,0.10), 0 12px 32px -8px rgba(41,37,30,0.10)',
      },
    },
  },
  plugins: [],
}
