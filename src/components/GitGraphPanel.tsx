import { layoutCommitGraph, type GraphRow } from '../lib/gitGraph'
import {
  commitFiles,
  commits,
  loadingCommitFiles,
  loadingCommits,
  selectCommit,
  selectCommitFile,
  selectedCommitHash,
  selectedKey,
  commitFileKey,
} from '../state'
import type { CommitFile } from '../types'

const LANE_W = 14
const ROW_H = 28
const DOT_R = 3.5
const COLORS = ['#3794ff', '#89d185', '#cca700', '#f14c4c', '#b180d7', '#75beff', '#e2c08d']

function laneColor(lane: number): string {
  return COLORS[lane % COLORS.length]
}

function GraphGlyph({ row }: { row: GraphRow }) {
  const width = Math.max(row.laneCount, 1) * LANE_W + 8
  const midY = ROW_H / 2
  const x = (lane: number) => 8 + lane * LANE_W + LANE_W / 2

  return (
    <svg class="graph-glyph" width={width} height={ROW_H} aria-hidden="true">
      {row.edges.map((edge, i) => {
        const x1 = x(edge.fromLane)
        const x2 = x(edge.toLane)
        const color = laneColor(edge.kind === 'merge' ? edge.toLane : edge.fromLane)
        if (edge.kind === 'pass' || (edge.kind === 'merge' && edge.fromLane === edge.toLane)) {
          return (
            <line
              key={`e${i}`}
              x1={x1}
              y1={0}
              x2={x2}
              y2={ROW_H}
              stroke={color}
              strokeWidth="1.5"
            />
          )
        }
        // merge curve from commit down toward parent lane
        const path = `M ${x1} ${midY} C ${x1} ${ROW_H * 0.75}, ${x2} ${ROW_H * 0.25}, ${x2} ${ROW_H}`
        return <path key={`e${i}`} d={path} fill="none" stroke={color} strokeWidth="1.5" />
      })}
      {/* stem above for continuing lane */}
      {row.activeLanes.includes(row.lane) ? (
        <line
          x1={x(row.lane)}
          y1={0}
          x2={x(row.lane)}
          y2={midY}
          stroke={laneColor(row.lane)}
          strokeWidth="1.5"
        />
      ) : null}
      <circle
        cx={x(row.lane)}
        cy={midY}
        r={DOT_R}
        fill={laneColor(row.lane)}
        stroke="#1e1e1e"
        strokeWidth="1"
      />
    </svg>
  )
}

function CommitRow({ row }: { row: GraphRow }) {
  const active = selectedCommitHash.value === row.commit.hash
  const refs = row.commit.refs.slice(0, 2)
  return (
    <button
      type="button"
      class={`commit-row ${active ? 'active' : ''}`}
      onClick={() => selectCommit(row.commit.hash)}
      title={`${row.commit.shortHash} ${row.commit.subject}`}
    >
      <GraphGlyph row={row} />
      <span class="commit-body">
        <span class="commit-subject">{row.commit.subject}</span>
        <span class="commit-meta">
          <span class="commit-hash">{row.commit.shortHash}</span>
          {refs.map((ref) => (
            <span key={ref} class="commit-ref">
              {ref.replace(/^HEAD -> /, '')}
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}

function statusLetter(status: CommitFile['status']): string {
  switch (status) {
    case 'added':
      return 'A'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    default:
      return 'M'
  }
}

export function GitGraphPanel() {
  const rows = layoutCommitGraph(commits.value)
  const hash = selectedCommitHash.value

  return (
    <div class="graph-panel">
      {loadingCommits.value && <p class="sidebar-empty">Loading history…</p>}
      {!loadingCommits.value && rows.length === 0 && (
        <p class="sidebar-empty">No commits found.</p>
      )}
      <div class="commit-list">
        {rows.map((row) => (
          <CommitRow key={row.commit.hash} row={row} />
        ))}
      </div>
      {hash && (
        <div class="commit-files">
          <header class="section-header">
            <span>Files</span>
            <span class="count">{commitFiles.value.length}</span>
          </header>
          {loadingCommitFiles.value && <p class="sidebar-empty">Loading files…</p>}
          <div class="file-list">
            {commitFiles.value.map((file) => {
              const key = commitFileKey(hash, file.path)
              const active = selectedKey.value === key
              return (
                <button
                  type="button"
                  key={key}
                  class={`file-row ${active ? 'active' : ''}`}
                  onClick={() => selectCommitFile(hash, file.path)}
                >
                  <span class={`status status-${file.status}`}>{statusLetter(file.status)}</span>
                  <span class="file-path" title={file.path}>
                    {file.path}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
