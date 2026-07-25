import { useEffect, useRef, useState } from 'preact/hooks'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { repo, terminalHeight, terminalOpen, themeId } from '../state'
import { getTheme } from '../theme/themes'

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function terminalTheme() {
  const ui = getTheme(themeId.value).ui
  return {
    background: ui['--bg'],
    foreground: ui['--text'],
    cursor: ui['--accent'],
    selectionBackground: ui['--bg-active'],
  }
}

const MIN_HEIGHT = 120

function maxHeight(): number {
  return Math.floor(window.innerHeight * 0.7)
}

export function TerminalPanel() {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [ready, setReady] = useState(false)
  const [sessionCwd, setSessionCwd] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const initialCwdRef = useRef(repo.value?.root ?? null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: readCssVar('--font-mono', 'Menlo, Monaco, monospace'),
      fontSize: 12,
      theme: terminalTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()
    termRef.current = term
    fitRef.current = fit
    setReady(true)

    const offData = window.conflicto.terminal.onData((data) => term.write(data))
    const offExit = window.conflicto.terminal.onExit(() => {
      terminalOpen.value = false
    })

    const onDataDisp = term.onData((data) => {
      void window.conflicto.terminal.write(data)
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        void window.conflicto.terminal.resize(term.cols, term.rows)
      } catch {
        // ignore fit errors while hidden
      }
    })
    ro.observe(host)

    return () => {
      setReady(false)
      ro.disconnect()
      offData()
      offExit()
      onDataDisp.dispose()
      void window.conflicto.terminal.stop()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return
    fit.fit()
    void window.conflicto.terminal
      .start({
        cwd: initialCwdRef.current,
        cols: term.cols,
        rows: term.rows,
      })
      .then((result) => {
        setSessionCwd(result.cwd)
        term.focus()
      })
  }, [ready])

  useEffect(() => {
    void themeId.value
    const term = termRef.current
    if (!ready || !term) return
    term.options.theme = terminalTheme()
  }, [ready, themeId.value])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const delta = drag.startY - e.clientY
      const next = Math.min(maxHeight(), Math.max(MIN_HEIGHT, drag.startHeight + delta))
      terminalHeight.value = next
    }

    const onUp = () => {
      dragRef.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging])

  function onResizePointerDown(e: PointerEvent) {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: terminalHeight.value }
    setDragging(true)
  }

  return (
    <div
      class={`terminal-panel ${dragging ? 'resizing' : ''}`}
      style={{ height: `${terminalHeight.value}px` }}
    >
      <div
        class="terminal-resize-handle"
        onPointerDown={onResizePointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
      />
      <div class="terminal-panel-header">
        <span>Terminal</span>
        <span class="terminal-cwd" title={sessionCwd ?? undefined}>
          {sessionCwd ?? '~'}
        </span>
      </div>
      <div class="terminal-host" ref={hostRef} />
    </div>
  )
}
