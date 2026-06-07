/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'hsl(142, 70%, 97%)',
          100: 'hsl(142, 70%, 93%)',
          500: 'hsl(142, 72%, 29%)', // Emerald Green
          600: 'hsl(142, 76%, 22%)',
          700: 'hsl(142, 72%, 16%)',
        },
        accent: {
          amber: 'hsl(38, 92%, 50%)',
          rose: 'hsl(346, 84%, 61%)',
          slate: 'hsl(215, 25%, 27%)',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-in': 'slideIn 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
