import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

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
    environment: 'happy-dom',
    include: ['src/**/*.test.js'],
    server: {
      deps: {
        inline: [/@pierre/, /@shikijs/, /shiki/],
      },
    },
  },
});