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
        // `maroon-*` is the active-school accent palette. Values come from
        // CSS variables (see src/index.css) so `data-school="rice"` on the
        // SchoolApp wrapper repaints the whole UI without any class renames.
        // Default values are TAMU maroon; the Rice override swaps to Rice blue.
        maroon: {
          50:  'rgb(var(--maroon-50)  / <alpha-value>)',
          100: 'rgb(var(--maroon-100) / <alpha-value>)',
          200: 'rgb(var(--maroon-200) / <alpha-value>)',
          300: 'rgb(var(--maroon-300) / <alpha-value>)',
          400: 'rgb(var(--maroon-400) / <alpha-value>)',
          500: 'rgb(var(--maroon-500) / <alpha-value>)',
          600: 'rgb(var(--maroon-600) / <alpha-value>)',
          700: 'rgb(var(--maroon-700) / <alpha-value>)',
          800: 'rgb(var(--maroon-800) / <alpha-value>)',
          900: 'rgb(var(--maroon-900) / <alpha-value>)',
          950: 'rgb(var(--maroon-950) / <alpha-value>)',
        },
        // Rice University blue (#00205B). Used on the school picker today;
        // full per-school theming is tracked separately.
        'rice-blue': {
          50:  '#eef3fb',
          100: '#d6e1f3',
          200: '#a7bee4',
          300: '#7197d2',
          400: '#3f6fbb',
          500: '#1f4a96',
          600: '#0e336f',
          700: '#00205B',
          800: '#001844',
          900: '#000f2c',
          950: '#000817',
        },
        // UT Dallas green (#154734). Same role as rice-blue / ut-orange.
        'utd-green': {
          50:  '#eef5f1',
          100: '#d4e6dd',
          200: '#a9cdbb',
          300: '#79b094',
          400: '#4a906e',
          500: '#2a6f4f',
          600: '#1d5a3f',
          700: '#154734',
          800: '#103829',
          900: '#0b291e',
          950: '#061811',
        },
        // UT Austin burnt orange (#BF5700). Same role as rice-blue — used on
        // the school picker / per-school accent until full theming lands.
        'ut-orange': {
          50:  '#fdf4ec',
          100: '#fbe4d2',
          200: '#f6c4a0',
          300: '#f0a06b',
          400: '#e87d3c',
          500: '#d4651f',
          600: '#bf5700',
          700: '#a04900',
          800: '#7e3a00',
          900: '#5f2c00',
          950: '#371900',
        },
        // MIT cardinal red (#A31F34). Used on the school picker.
        'mit-red': {
          50:  '#fdf2f4',
          100: '#fae0e4',
          200: '#f4b8c2',
          300: '#e8889a',
          400: '#d95270',
          500: '#c03050',
          600: '#8c1a2b',
          700: '#A31F34',
          800: '#821929',
          900: '#5e121e',
          950: '#380b12',
        },
        // Harvard crimson (#A51C30). Used on the school picker.
        'harvard-crimson': {
          50:  '#fdf2f3',
          100: '#fadde0',
          200: '#f4b5bb',
          300: '#e88090',
          400: '#d94460',
          500: '#c02244',
          600: '#8e1826',
          700: '#A51C30',
          800: '#821626',
          900: '#5e101b',
          950: '#380a10',
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
