import { useEffect, useRef } from 'preact/hooks'
import { useSignalEffect } from '@preact/signals'
import { FileDiff as PierreFileDiff } from '@pierre/diffs'
import type { FileContents, SupportedLanguages } from '@pierre/diffs'
import { diff, sideBySide, themeId } from '../state'
import { getTheme } from '../theme/themes'

function toShikiLang(language: string): SupportedLanguages | undefined {
  switch (language) {
    case 'plaintext':
      return 'text'
    case 'shell':
      return 'bash'
    case 'ini':
      return 'toml'
    default:
      // Prefer filename inference for known Monaco-compatible ids
      return undefined
  }
}

function toFileContents(path: string, contents: string, language: string): FileContents {
  const lang = toShikiLang(language)
  return lang ? { name: path, contents, lang } : { name: path, contents }
}

function viewOptions() {
  const pack = getTheme(themeId.value)
  return {
    theme: pack.shikiTheme,
    themeType: pack.scheme,
    diffStyle: (sideBySide.value ? 'split' : 'unified') as 'split' | 'unified',
    disableFileHeader: true,
    expandUnchanged: true,
    overflow: 'scroll' as const,
  }
}

function renderInto(view: PierreFileDiff, host: HTMLElement) {
  const current = diff.value
  if (!current) return
  // Let Pierre create <diffs-container> (adopts core layout CSS). Passing our
  // host as fileContainer skips that and leaves gutters unstyled/stacked.
  view.setOptions(viewOptions())
  view.render({
    containerWrapper: host,
    oldFile: toFileContents(current.path, current.original, current.language),
    newFile: toFileContents(current.path, current.modified, current.language),
    forceRender: true,
  })
}

export function PierreDiffView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<PierreFileDiff | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const view = new PierreFileDiff(viewOptions())
    viewRef.current = view
    renderInto(view, el)

    return () => {
      view.cleanUp()
      viewRef.current = null
      el.replaceChildren()
    }
  }, [])

  useSignalEffect(() => {
    const view = viewRef.current
    const el = containerRef.current
    // Track layout/theme/diff signals
    void themeId.value
    void sideBySide.value
    void diff.value
    if (!view || !el) return
    renderInto(view, el)
  })

  return <div class="diff-editor" ref={containerRef} />
}
