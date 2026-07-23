import { useEffect, useRef } from 'preact/hooks'
import { useSignalEffect } from '@preact/signals'
import type { editor } from 'monaco-editor'
import { diff, sideBySide } from '../state'
import { loadMonaco } from '../lib/monaco'

export function MonacoDiffView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null)
  const modelsRef = useRef<{
    original: editor.ITextModel | null
    modified: editor.ITextModel | null
  }>({ original: null, modified: null })
  const readyRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let disposed = false

    ;(async () => {
      const monaco = await loadMonaco()
      if (disposed || !containerRef.current) return

      const ed = monaco.editor.createDiffEditor(containerRef.current, {
        automaticLayout: true,
        readOnly: true,
        originalEditable: false,
        renderSideBySide: sideBySide.value,
        theme: 'vs-dark',
        scrollBeyondLastLine: false,
        minimap: { enabled: false },
        renderIndicators: true,
        ignoreTrimWhitespace: false,
        fontSize: 13,
        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
        padding: { top: 8 },
      })

      editorRef.current = ed
      readyRef.current = true

      const current = diff.value
      if (current) {
        applyDiff(monaco, ed, current.original, current.modified, current.language, current.path)
      }
    })()

    return () => {
      disposed = true
      readyRef.current = false
      modelsRef.current.original?.dispose()
      modelsRef.current.modified?.dispose()
      modelsRef.current = { original: null, modified: null }
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  useSignalEffect(() => {
    // Read the signal first so we always subscribe, even before the editor exists.
    const renderSideBySide = sideBySide.value
    const ed = editorRef.current
    if (!ed || !readyRef.current) return
    ed.updateOptions({ renderSideBySide })
  })

  useSignalEffect(() => {
    const current = diff.value
    const ed = editorRef.current
    if (!ed || !readyRef.current || !current) return

    let cancelled = false
    ;(async () => {
      const monaco = await loadMonaco()
      if (cancelled || editorRef.current !== ed) return
      applyDiff(monaco, ed, current.original, current.modified, current.language, current.path)
    })()

    return () => {
      cancelled = true
    }
  })

  function applyDiff(
    monaco: typeof import('monaco-editor'),
    ed: editor.IStandaloneDiffEditor,
    original: string,
    modified: string,
    language: string,
    filePath: string,
  ) {
    modelsRef.current.original?.dispose()
    modelsRef.current.modified?.dispose()

    const originalModel = monaco.editor.createModel(
      original,
      language,
      monaco.Uri.parse(`conflicto://original/${filePath}`),
    )
    const modifiedModel = monaco.editor.createModel(
      modified,
      language,
      monaco.Uri.parse(`conflicto://modified/${filePath}`),
    )

    modelsRef.current = { original: originalModel, modified: modifiedModel }
    ed.setModel({ original: originalModel, modified: modifiedModel })
  }

  return <div class="diff-editor" ref={containerRef} />
}
