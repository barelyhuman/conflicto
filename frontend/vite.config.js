import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: [
      { find: 'react', replacement: 'preact/compat' },
      { find: 'react-dom', replacement: 'preact/compat' },
      { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' },
    ],
  },
})
