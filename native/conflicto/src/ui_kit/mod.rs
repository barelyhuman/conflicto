//! Thin SwiftUI-like layout helpers on top of egui (tokens + stacks).
//!
//! Intentionally small: chrome layouts without hand-rolled width arithmetic.
//! Diff editing stays imperative in `diff_widget`.

#![allow(dead_code)] // Public kit surface grows ahead of call sites.
#![allow(unused_imports)] // Re-exports are part of the public API.

mod container;
mod stack;
mod tokens;

pub use container::{container, Background};
pub use stack::{Child, HStack, VStack};
pub use tokens::{ControlSize, Insets, LayoutSize, Space};
