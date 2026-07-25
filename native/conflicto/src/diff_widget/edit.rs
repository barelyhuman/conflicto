use egui::Color32;

/// Aggregate edit events from a painted editable window.
#[derive(Default)]
pub struct RowEditPass {
    pub changed: bool,
    pub split_at: Option<(usize, usize)>,
    pub merge_at: Option<usize>,
}

impl RowEditPass {
    pub fn absorb(&mut self, row_i: usize, event: EditRowEvent, can_merge: bool) {
        if event.changed {
            self.changed = true;
        }
        if let Some(cc) = event.split_at {
            self.split_at = Some((row_i, cc));
        }
        if event.merge && can_merge {
            self.merge_at = Some(row_i);
        }
    }
}

pub struct EditRowEvent {
    pub changed: bool,
    pub split_at: Option<usize>,
    pub merge: bool,
}

pub fn write_back_edit(edit_buffer: Option<&mut String>, new_buffer: Option<String>) -> bool {
    if let (Some(buf), Some(edit)) = (new_buffer, edit_buffer) {
        if buf != *edit {
            *edit = buf;
            return true;
        }
    }
    false
}

pub fn rgb(c: [u8; 3]) -> Color32 {
    Color32::from_rgb(c[0], c[1], c[2])
}

pub fn tint(bg: [u8; 3], accent: [u8; 3], amount: f32) -> Color32 {
    let t = amount.clamp(0.0, 1.0);
    Color32::from_rgb(
        (bg[0] as f32 + (accent[0] as f32 - bg[0] as f32) * t).round() as u8,
        (bg[1] as f32 + (accent[1] as f32 - bg[1] as f32) * t).round() as u8,
        (bg[2] as f32 + (accent[2] as f32 - bg[2] as f32) * t).round() as u8,
    )
}
