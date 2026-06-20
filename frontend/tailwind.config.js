/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: '#1e1e1e',          // Editor background (VS Code dark)
          terminal: '#141414',    // Terminal panel background
          sidebar: '#252526',     // Sidebar background
          tabActive: '#1e1e1e',   // Active tab background
          tabInactive: '#2d2d2d', // Inactive tab background
          border: '#3c3c3c',      // VS Code dark border
          header: '#323233',      // Top nav header background
          statusBg: '#007acc',    // VS Code blue status bar
          statusText: '#ffffff',
          text: '#cccccc',        // Default text color
          textMuted: '#858585',   // Muted text
          accent: '#0e639c',      // VS Code selection accent
          accentHover: '#1177bb', // Accent hover state
          error: '#f14c4c',       // Soft red error
          warning: '#cca700',     // Warning yellow
          success: '#89d185',     // Soft green success
        }
      },
      fontFamily: {
        mono: ['Cascadia Code', 'JetBrains Mono', 'Consolas', 'Monaco', 'monospace'],
        sans: ['Segoe UI', 'Inter', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
