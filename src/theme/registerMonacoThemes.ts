import type * as Monaco from 'monaco-editor'
import { THEMES } from './themes'

let registered = false

export function registerMonacoThemes(monaco: typeof Monaco): void {
  if (registered) return
  for (const pack of THEMES) {
    if (pack.monacoData) {
      monaco.editor.defineTheme(pack.monacoThemeId, pack.monacoData)
    }
  }
  registered = true
}
