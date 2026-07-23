import type { CommitInfo } from '../types'

export interface GraphEdge {
  fromLane: number
  toLane: number
  /** 'pass' continues through; 'merge' joins into commit lane; 'branch' forks from parent */
  kind: 'pass' | 'merge' | 'branch'
}

export interface GraphRow {
  commit: CommitInfo
  lane: number
  laneCount: number
  /** Active lanes at this row before placing the commit */
  activeLanes: number[]
  edges: GraphEdge[]
}

/**
 * Assigns commit lanes for a newest-first commit list (git log order).
 * Parents that appear later reuse / expand lanes like a classic ASCII graph.
 */
export function layoutCommitGraph(commits: CommitInfo[]): GraphRow[] {
  const rows: GraphRow[] = []
  /** Lane index -> commit hash expected next on that lane (child we came from) */
  let lanes: (string | null)[] = []

  for (const commit of commits) {
    const edges: GraphEdge[] = []
    let lane = lanes.findIndex((h) => h === commit.hash)
    if (lane === -1) {
      lane = lanes.findIndex((h) => h === null)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(commit.hash)
      } else {
        lanes[lane] = commit.hash
      }
    }

    const activeBefore = lanes
      .map((h, i) => (h != null ? i : -1))
      .filter((i) => i >= 0)

    // Continuing verticals for other active lanes
    for (let i = 0; i < lanes.length; i++) {
      if (i === lane) continue
      if (lanes[i] != null) {
        edges.push({ fromLane: i, toLane: i, kind: 'pass' })
      }
    }

    const parents = commit.parents
    if (parents.length === 0) {
      lanes[lane] = null
    } else {
      // First parent continues on this lane
      lanes[lane] = parents[0]
      // Additional parents: merge edges into existing or new lanes
      for (let p = 1; p < parents.length; p++) {
        const parent = parents[p]
        let parentLane = lanes.findIndex((h) => h === parent)
        if (parentLane === -1) {
          parentLane = lanes.findIndex((h) => h === null)
          if (parentLane === -1) {
            parentLane = lanes.length
            lanes.push(parent)
          } else {
            lanes[parentLane] = parent
          }
        }
        edges.push({ fromLane: lane, toLane: parentLane, kind: 'merge' })
      }
    }

    // Compact trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    rows.push({
      commit,
      lane,
      laneCount: Math.max(lanes.length, lane + 1, 1),
      activeLanes: activeBefore,
      edges,
    })
  }

  return rows
}
