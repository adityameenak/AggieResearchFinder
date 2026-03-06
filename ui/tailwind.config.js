/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        maroon: {
          50:  '#fdf2f2',
          100: '#fde8e8',
          200: '#f9c9c9',
          300: '#f49393',
          400: '#e05050',
          500: '#8b1a1a',
          600: '#6b1414',
          700: '#500000',
          800: '#3d0000',
          900: '#2a0000',
          950: '#150000',
        },
        cream: {
          50:  '#FFFDF9',
          100: '#FBF7EF',
          200: '#F5EFE3',
          300: '#EDE4D3',
          400: '#DDD0BC',
          500: '#C8B89A',
        },
        gold: {
          light: '#F0E0B0',
          DEFAULT: '#C8A96E',
          dark: '#9A7A44',
        },
      },
    },
  },
  plugins: [],
}
