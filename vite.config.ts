import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

const external = Object.keys(
  'dependencies' in pkg ? (pkg.dependencies as Record<string, string>) : {},
)

/** Cursor / some hosts set this; it makes Electron act as plain Node and breaks `import 'electron'`. */
function electronLaunchEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

const DEBUG_ARGV = [
  '.',
  '--no-sandbox',
  '--remote-debugging-port=9222',
  '--inspect=9229',
]

export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
      },
    },
    plugins: [
      preact(),
      electron({
        main: {
          entry: 'electron/main/index.ts',
          onstart({ startup }) {
            console.log(
              '[conflicto] Electron debug: CDP http://127.0.0.1:9222  inspect ws://127.0.0.1:9229',
            )
            startup(DEBUG_ARGV, { env: electronLaunchEnv() })
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: ['electron', ...external],
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: ['electron', ...external],
              },
            },
          },
        },
        renderer: {},
      }),
    ],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['monaco-editor'],
    },
    clearScreen: false,
  }
})
