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
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'tabler-icons',
              test: /[\\/]@tabler[\\/]icons-preact/,
            },
            {
              name: 'pierre-diffs',
              test: /[\\/](?:@pierre[\\/]diffs|@shikijs[\\/]|shiki)([\\/]|$)/,
            },
            {
              name: 'pierre-trees',
              test: /[\\/]@pierre[\\/]trees([\\/]|$)/,
            },
            {
              name: 'xterm',
              test: /[\\/]@xterm[\\/]/,
            },
          ],
        },
      },
    },
  },
})
