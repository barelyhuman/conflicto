//! HStack / VStack with flex + fixed children (sizes declared, then filled).

use egui::{Color32, Ui};

use super::container::Background;
use super::tokens::{Insets, Space};

/// Main-axis size for one stack child.
#[derive(Debug, Clone, Copy)]
pub enum Child {
    Flex(f32),
    Fixed(f32),
}

impl Child {
    pub fn flex(factor: f32) -> Self {
        Self::Flex(factor.max(0.0))
    }

    pub fn fixed(size: f32) -> Self {
        Self::Fixed(size.max(0.0))
    }
}

/// Horizontal stack: fixed widths + flex factors sharing leftover space.
pub struct HStack {
    gap: f32,
    padding: Insets,
    height: Option<f32>,
    background: Option<Background>,
}

impl Default for HStack {
    fn default() -> Self {
        Self::new()
    }
}

impl HStack {
    pub fn new() -> Self {
        Self {
            gap: Space::Sm.px(),
            padding: Insets::ZERO,
            height: None,
            background: None,
        }
    }

    pub fn gap(mut self, gap: impl Into<f32>) -> Self {
        self.gap = gap.into();
        self
    }

    pub fn padding(mut self, padding: impl Into<Insets>) -> Self {
        self.padding = padding.into();
        self
    }

    pub fn frame_height(mut self, height: f32) -> Self {
        self.height = Some(height);
        self
    }

    pub fn background(mut self, fill: Color32) -> Self {
        self.background = Some(Background::fill(fill));
        self
    }

    /// Lay out `children` and call `add(ui, index)` inside each slot.
    pub fn show(self, ui: &mut Ui, children: &[Child], mut add: impl FnMut(&mut Ui, usize)) {
        let mut frame = egui::Frame::NONE.inner_margin(self.padding.to_egui());
        if let Some(bg) = self.background {
            frame = frame.fill(bg.fill);
        }

        frame.show(ui, |ui| {
            ui.set_width(ui.available_width());
            if let Some(h) = self.height {
                ui.set_height(h);
            }
            let height = self.height.unwrap_or(ui.available_height()).max(1.0);
            layout_axis(ui, Axis::Horizontal, self.gap, height, children, &mut add);
        });
    }
}

/// Vertical stack: fixed heights + flex factors sharing leftover space.
pub struct VStack {
    gap: f32,
    padding: Insets,
    width: Option<f32>,
    background: Option<Background>,
}

impl Default for VStack {
    fn default() -> Self {
        Self::new()
    }
}

impl VStack {
    pub fn new() -> Self {
        Self {
            gap: Space::Sm.px(),
            padding: Insets::ZERO,
            width: None,
            background: None,
        }
    }

    pub fn gap(mut self, gap: impl Into<f32>) -> Self {
        self.gap = gap.into();
        self
    }

    pub fn padding(mut self, padding: impl Into<Insets>) -> Self {
        self.padding = padding.into();
        self
    }

    pub fn frame_width(mut self, width: f32) -> Self {
        self.width = Some(width);
        self
    }

    pub fn background(mut self, fill: Color32) -> Self {
        self.background = Some(Background::fill(fill));
        self
    }

    pub fn show(self, ui: &mut Ui, children: &[Child], mut add: impl FnMut(&mut Ui, usize)) {
        let mut frame = egui::Frame::NONE.inner_margin(self.padding.to_egui());
        if let Some(bg) = self.background {
            frame = frame.fill(bg.fill);
        }

        frame.show(ui, |ui| {
            if let Some(w) = self.width {
                ui.set_width(w);
            } else {
                ui.set_width(ui.available_width());
            }
            let cross = self.width.unwrap_or(ui.available_width()).max(1.0);
            layout_axis(ui, Axis::Vertical, self.gap, cross, children, &mut add);
        });
    }
}

#[derive(Clone, Copy)]
enum Axis {
    Horizontal,
    Vertical,
}

fn layout_axis(
    ui: &mut Ui,
    axis: Axis,
    gap: f32,
    cross: f32,
    children: &[Child],
    add: &mut impl FnMut(&mut Ui, usize),
) {
    if children.is_empty() {
        return;
    }

    let n = children.len();
    let gaps = gap * (n.saturating_sub(1) as f32);
    let main_avail = match axis {
        Axis::Horizontal => ui.available_width(),
        Axis::Vertical => ui.available_height(),
    };

    let mut fixed_sum = 0.0_f32;
    let mut flex_sum = 0.0_f32;
    for child in children {
        match *child {
            Child::Fixed(w) => fixed_sum += w,
            Child::Flex(f) => flex_sum += f,
        }
    }
    let flex_space = (main_avail - fixed_sum - gaps).max(0.0);

    match axis {
        Axis::Horizontal => {
            ui.spacing_mut().item_spacing.x = gap;
            ui.horizontal(|ui| {
                for (i, child) in children.iter().enumerate() {
                    let w = match *child {
                        Child::Fixed(w) => w,
                        Child::Flex(f) => {
                            if flex_sum > 0.0 {
                                flex_space * (f / flex_sum)
                            } else {
                                0.0
                            }
                        }
                    };
                    ui.allocate_ui_with_layout(
                        egui::vec2(w.max(1.0), cross),
                        egui::Layout::left_to_right(egui::Align::Center),
                        |ui| {
                            ui.set_min_height(cross);
                            ui.set_max_width(w.max(1.0));
                            ui.spacing_mut().interact_size.y = cross;
                            add(ui, i);
                        },
                    );
                }
            });
        }
        Axis::Vertical => {
            ui.spacing_mut().item_spacing.y = gap;
            ui.vertical(|ui| {
                for (i, child) in children.iter().enumerate() {
                    let h = match *child {
                        Child::Fixed(h) => h,
                        Child::Flex(f) => {
                            if flex_sum > 0.0 {
                                flex_space * (f / flex_sum)
                            } else {
                                0.0
                            }
                        }
                    };
                    ui.allocate_ui_with_layout(
                        egui::vec2(cross, h.max(1.0)),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            ui.set_min_width(cross);
                            ui.set_max_height(h.max(1.0));
                            add(ui, i);
                        },
                    );
                }
            });
        }
    }
}
