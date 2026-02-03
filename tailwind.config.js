/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ved Kanalen brand colors (customize as needed)
        brand: {
          primary: '#2C3E50',
          secondary: '#E67E22',
          accent: '#1ABC9C',
          light: '#ECF0F1',
          dark: '#1A252F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
