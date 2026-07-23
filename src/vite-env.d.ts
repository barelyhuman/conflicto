/// <reference types="vite/client" />

interface MonacoEnvironment {
  getWorker(workerId: string, label: string): Worker
}

declare global {
  // eslint-disable-next-line no-var
  var MonacoEnvironment: MonacoEnvironment | undefined
}

export {}
