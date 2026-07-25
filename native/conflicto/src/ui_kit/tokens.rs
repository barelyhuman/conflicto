//! Spacing and control-size tokens for chrome layout.

/// Named spacing scale (points).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Space {
    Xs = 4,
    Sm = 6,
    Md = 12,
    Lg = 16,
}

impl Space {
    pub const fn px(self) -> f32 {
        self as u8 as f32
    }
}

/// Control / chrome heights used across the app.
pub struct ControlSize;

impl ControlSize {
    /// Outer toolbar / sidebar header strip height.
    pub const TOOLBAR: f32 = 42.0;
    /// Inner control height inside a toolbar with `Space::Sm` vertical padding.
    pub const TOOLBAR_INNER: f32 = 30.0; // TOOLBAR - 2 * Space::Sm
    /// Default list / selectable row height target.
    pub const ROW: f32 = 28.0;
}

/// Fixed layout widths (sidebar, etc.).
pub struct LayoutSize;

impl LayoutSize {
    pub const SIDEBAR: f32 = 320.0;
}

/// Padding / margin insets.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Insets {
    pub left: f32,
    pub right: f32,
    pub top: f32,
    pub bottom: f32,
}

impl Insets {
    pub const ZERO: Self = Self {
        left: 0.0,
        right: 0.0,
        top: 0.0,
        bottom: 0.0,
    };

    pub fn all(v: impl Into<f32>) -> Self {
        let v = v.into();
        Self {
            left: v,
            right: v,
            top: v,
            bottom: v,
        }
    }

    pub fn hv(horizontal: impl Into<f32>, vertical: impl Into<f32>) -> Self {
        let h = horizontal.into();
        let v = vertical.into();
        Self {
            left: h,
            right: h,
            top: v,
            bottom: v,
        }
    }

    pub fn from_space(horizontal: Space, vertical: Space) -> Self {
        Self::hv(horizontal.px(), vertical.px())
    }

    pub fn to_egui(self) -> egui::Margin {
        egui::Margin {
            left: self.left as i8,
            right: self.right as i8,
            top: self.top as i8,
            bottom: self.bottom as i8,
        }
    }
}

impl From<Space> for f32 {
    fn from(value: Space) -> Self {
        value.px()
    }
}

impl From<Space> for Insets {
    fn from(value: Space) -> Self {
        Self::all(value.px())
    }
}
