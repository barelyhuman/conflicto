//! Diff view cache, scroll, paint, and side-by-side / inline widgets.

mod cache;
mod edit;
mod minimap;
mod paint;
mod scroll;
mod view;

pub use cache::DiffViewCache;
pub use scroll::DiffScroll;
pub use view::{show_inline, show_side_by_side, DiffWidgetOutcome};
