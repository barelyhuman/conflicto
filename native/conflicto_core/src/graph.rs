use crate::models::CommitInfo;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphEdgeKind {
    Pass,
    Merge,
    Branch,
}

#[derive(Debug, Clone)]
pub struct GraphEdge {
    pub from_lane: usize,
    pub to_lane: usize,
    pub kind: GraphEdgeKind,
}

#[derive(Debug, Clone)]
pub struct GraphRow {
    pub commit: CommitInfo,
    pub lane: usize,
    pub lane_count: usize,
    pub active_lanes: Vec<usize>,
    pub edges: Vec<GraphEdge>,
}

/// Assigns commit lanes for a newest-first commit list (git log order).
pub fn layout_commit_graph(commits: &[CommitInfo]) -> Vec<GraphRow> {
    let mut rows = Vec::new();
    let mut lanes: Vec<Option<String>> = Vec::new();

    for commit in commits {
        let mut edges = Vec::new();
        let mut lane = lanes
            .iter()
            .position(|h| h.as_deref() == Some(commit.hash.as_str()));
        if lane.is_none() {
            lane = lanes.iter().position(|h| h.is_none());
            if let Some(l) = lane {
                lanes[l] = Some(commit.hash.clone());
            } else {
                lane = Some(lanes.len());
                lanes.push(Some(commit.hash.clone()));
            }
        }
        let lane = lane.unwrap_or(0);

        let active_before: Vec<usize> = lanes
            .iter()
            .enumerate()
            .filter_map(|(i, h)| h.as_ref().map(|_| i))
            .collect();

        for (i, h) in lanes.iter().enumerate() {
            if i == lane {
                continue;
            }
            if h.is_some() {
                edges.push(GraphEdge {
                    from_lane: i,
                    to_lane: i,
                    kind: GraphEdgeKind::Pass,
                });
            }
        }

        if commit.parents.is_empty() {
            lanes[lane] = None;
        } else {
            lanes[lane] = Some(commit.parents[0].clone());
            for parent in commit.parents.iter().skip(1) {
                let mut parent_lane = lanes.iter().position(|h| h.as_deref() == Some(parent.as_str()));
                if parent_lane.is_none() {
                    parent_lane = lanes.iter().position(|h| h.is_none());
                    if let Some(pl) = parent_lane {
                        lanes[pl] = Some(parent.clone());
                    } else {
                        parent_lane = Some(lanes.len());
                        lanes.push(Some(parent.clone()));
                    }
                }
                edges.push(GraphEdge {
                    from_lane: lane,
                    to_lane: parent_lane.unwrap_or(0),
                    kind: GraphEdgeKind::Merge,
                });
            }
        }

        while lanes.last().is_some_and(|h| h.is_none()) {
            lanes.pop();
        }

        rows.push(GraphRow {
            commit: commit.clone(),
            lane,
            lane_count: lanes.len().max(lane + 1).max(1),
            active_lanes: active_before,
            edges,
        });
    }

    rows
}

/// Compact unicode glyph for a graph row (lane columns + commit marker).
pub fn graph_row_glyph(row: &GraphRow) -> String {
    let width = row.lane_count.max(1);
    let mut cols: Vec<char> = vec![' '; width];
    for &lane in &row.active_lanes {
        if lane < cols.len() {
            cols[lane] = '│';
        }
    }
    for edge in &row.edges {
        match edge.kind {
            GraphEdgeKind::Pass => {
                if edge.from_lane < cols.len() {
                    cols[edge.from_lane] = '│';
                }
            }
            GraphEdgeKind::Merge | GraphEdgeKind::Branch => {
                let a = edge.from_lane.min(edge.to_lane);
                let b = edge.from_lane.max(edge.to_lane);
                for i in a..=b {
                    if i >= cols.len() {
                        break;
                    }
                    if i == edge.from_lane {
                        cols[i] = if edge.from_lane < edge.to_lane {
                            '╭'
                        } else if edge.from_lane > edge.to_lane {
                            '╮'
                        } else {
                            '●'
                        };
                    } else if i == edge.to_lane {
                        cols[i] = '│';
                    } else if cols[i] == ' ' || cols[i] == '│' {
                        cols[i] = '─';
                    }
                }
            }
        }
    }
    if row.lane < cols.len() {
        cols[row.lane] = '●';
    }
    cols.into_iter().collect()
}
