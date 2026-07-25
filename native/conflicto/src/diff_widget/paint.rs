use conflicto_core::{
    highlight_color, DiffLine, HighlightPalette, HighlightSpan, LineKind, UiVars,
};
use egui::text::{LayoutJob, TextFormat};
use egui::{
    text_edit::TextEditOutput, Color32, FontFamily, FontId, Key, RichText, TextEdit, Ui,
};

use super::edit::{rgb, tint, EditRowEvent};
use super::scroll::{LINE_FONT, ROW_HEIGHT, ROW_PAD_X};

pub fn monospace_font() -> FontId {
    FontId::new(LINE_FONT, FontFamily::Monospace)
}

pub fn measure_text_width(ui: &Ui, text: &str) -> f32 {
    let font = monospace_font();
    ui.fonts(|f| {
        f.layout_no_wrap(text.to_owned(), font, Color32::WHITE)
            .size()
            .x
    })
}

/// Gutter + marker + spacing left of the code text.
pub fn gutter_chrome_width(ui: &Ui) -> f32 {
    measure_text_width(ui, "0000") + 8.0 + measure_text_width(ui, "−") + 8.0 + ROW_PAD_X
}

pub fn line_fill(kind: LineKind, u: &UiVars) -> Color32 {
    match kind {
        LineKind::Equal => rgb(u.bg),
        LineKind::Delete => tint(u.bg, u.status_d, 0.28),
        LineKind::Insert => tint(u.bg, u.status_a, 0.28),
        LineKind::Gap => tint(u.bg, u.text_muted, 0.08),
    }
}

pub fn line_text_color(kind: LineKind, u: &UiVars) -> Color32 {
    match kind {
        LineKind::Delete => rgb(u.status_d),
        LineKind::Insert => rgb(u.status_a),
        LineKind::Gap => rgb(u.text_muted),
        LineKind::Equal => rgb(u.text),
    }
}

pub fn layout_job_highlighted(
    source: &str,
    spans: &[HighlightSpan],
    palette: &HighlightPalette,
    fallback: [u8; 3],
) -> LayoutJob {
    let font = FontId::new(LINE_FONT, FontFamily::Monospace);
    let mut job = LayoutJob::default();
    if source.is_empty() {
        return job;
    }
    if spans.is_empty() {
        job.append(
            source,
            0.0,
            TextFormat {
                font_id: font,
                color: rgb(fallback),
                ..Default::default()
            },
        );
        return job;
    }

    let mut cursor = 0usize;
    // Spans are sorted once in DiffViewCache::ensure.
    for span in spans {
        let start = span.range.start.min(source.len());
        let end = span.range.end.min(source.len());
        if start < cursor {
            continue;
        }
        if cursor < start {
            job.append(
                &source[cursor..start],
                0.0,
                TextFormat {
                    font_id: font.clone(),
                    color: rgb(fallback),
                    ..Default::default()
                },
            );
        }
        if start < end {
            job.append(
                &source[start..end],
                0.0,
                TextFormat {
                    font_id: font.clone(),
                    color: rgb(highlight_color(span.kind, palette)),
                    ..Default::default()
                },
            );
        }
        cursor = end;
    }
    if cursor < source.len() {
        job.append(
            &source[cursor..],
            0.0,
            TextFormat {
                font_id: font,
                color: rgb(fallback),
                ..Default::default()
            },
        );
    }
    job
}

fn line_spans_for(
    spans: &[HighlightSpan],
    line_start: usize,
    line_len: usize,
) -> Vec<HighlightSpan> {
    let line_end = line_start + line_len;
    spans
        .iter()
        .filter_map(|s| {
            let start = s.range.start.max(line_start);
            let end = s.range.end.min(line_end);
            if start >= end {
                return None;
            }
            Some(HighlightSpan {
                range: (start - line_start)..(end - line_start),
                kind: s.kind,
            })
        })
        .collect()
}

fn fallback_for_kind(kind: LineKind, u: &UiVars) -> [u8; 3] {
    match kind {
        LineKind::Equal => u.text,
        LineKind::Delete => u.status_d,
        LineKind::Insert => u.status_a,
        LineKind::Gap => u.text_muted,
    }
}

fn paint_gutter(ui: &mut Ui, line: &DiffLine, u: &UiVars) {
    let gutter = match line.line_no {
        Some(n) => format!("{n:>4}"),
        None => "    ".into(),
    };
    ui.label(
        RichText::new(gutter)
            .monospace()
            .size(LINE_FONT)
            .color(rgb(u.text_muted)),
    );
    let marker = match line.kind {
        LineKind::Delete => "−",
        LineKind::Insert => "+",
        LineKind::Equal | LineKind::Gap => " ",
    };
    ui.label(
        RichText::new(marker)
            .monospace()
            .size(LINE_FONT)
            .color(line_text_color(line.kind, u)),
    );
}

fn paint_readonly_text(
    ui: &mut Ui,
    line: &DiffLine,
    u: &UiVars,
    spans: &[HighlightSpan],
    line_starts: &[usize],
    palette: &HighlightPalette,
) {
    if line.kind == LineKind::Gap || (line.text.is_empty() && line.line_no.is_none()) {
        ui.label(
            RichText::new(" ")
                .monospace()
                .size(LINE_FONT)
                .color(rgb(u.text_muted)),
        );
        return;
    }
    let job = if let Some(n) = line.line_no {
        let start = line_starts.get(n - 1).copied().unwrap_or(0);
        let local = line_spans_for(spans, start, line.text.len());
        let mut job = layout_job_highlighted(
            &line.text,
            &local,
            palette,
            fallback_for_kind(line.kind, u),
        );
        job.wrap.max_width = f32::INFINITY;
        job
    } else {
        let mut job =
            layout_job_highlighted(&line.text, &[], palette, fallback_for_kind(line.kind, u));
        job.wrap.max_width = f32::INFINITY;
        job
    };
    ui.label(job);
}

/// Paint one aligned row cell at a fixed height (hunk fill + gutter + body).
pub fn paint_row_cell(
    ui: &mut Ui,
    width: f32,
    line: &DiffLine,
    u: &UiVars,
    body: impl FnOnce(&mut Ui),
) {
    let fill = line_fill(line.kind, u);
    let (rect, _resp) = ui.allocate_exact_size(egui::vec2(width, ROW_HEIGHT), egui::Sense::hover());
    let clip = rect.intersect(ui.clip_rect());
    ui.painter().with_clip_rect(clip).rect_filled(rect, 0.0, fill);
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
    );
    child.set_clip_rect(clip);
    child.spacing_mut().item_spacing.x = 8.0;
    child.add_space(ROW_PAD_X);
    paint_gutter(&mut child, line, u);
    body(&mut child);
}

pub fn paint_readonly_cell(
    ui: &mut Ui,
    width: f32,
    line: &DiffLine,
    u: &UiVars,
    spans: &[HighlightSpan],
    line_starts: &[usize],
    palette: &HighlightPalette,
) {
    paint_row_cell(ui, width, line, u, |ui| {
        paint_readonly_text(ui, line, u, spans, line_starts, palette);
    });
}

pub fn paint_editable_cell(
    ui: &mut Ui,
    width: f32,
    line: &mut DiffLine,
    u: &UiVars,
    spans: &[HighlightSpan],
    line_starts: &[usize],
    palette: &HighlightPalette,
    line_id: egui::Id,
) -> EditRowEvent {
    let kind = line.kind;
    let line_no = line.line_no;
    let mut event = EditRowEvent {
        changed: false,
        split_at: None,
        merge: false,
    };

    // Chrome borrows DiffLine immutably; mutate text only inside the body via a stub row.
    let chrome = DiffLine {
        text: String::new(),
        kind,
        line_no,
    };
    paint_row_cell(ui, width, &chrome, u, |child| {
        let mut layouter = |ui: &Ui, text: &str, _wrap_width: f32| {
            let local = if let Some(n) = line_no {
                let start = line_starts.get(n - 1).copied().unwrap_or(0);
                line_spans_for(spans, start, text.len())
            } else {
                Vec::new()
            };
            let mut job =
                layout_job_highlighted(text, &local, palette, fallback_for_kind(kind, u));
            job.wrap.max_width = f32::INFINITY;
            ui.fonts(|f| f.layout_job(job))
        };

        let text_w = measure_text_width(child, &line.text).max(40.0);
        let edit_w = (child.max_rect().width() - gutter_chrome_width(child)).max(text_w);

        let output: TextEditOutput = TextEdit::singleline(&mut line.text)
            .id(line_id)
            .frame(false)
            .margin(egui::Margin::ZERO)
            .desired_width(edit_w)
            .font(monospace_font())
            .text_color(rgb(fallback_for_kind(kind, u)))
            .layouter(&mut layouter)
            .clip_text(false)
            .show(child);

        if output.response.changed() {
            event.changed = true;
        }
        if output.response.has_focus() && child.input(|i| i.key_pressed(Key::Enter)) {
            event.split_at = Some(
                output
                    .cursor_range
                    .map(|r| r.primary.ccursor.index)
                    .unwrap_or_else(|| line.text.chars().count()),
            );
        }
        if output.response.has_focus() && child.input(|i| i.key_pressed(Key::Backspace)) {
            let at_start = output
                .cursor_range
                .map(|r| r.primary.ccursor.index == 0)
                .unwrap_or(false);
            if at_start {
                event.merge = true;
            }
        }
    });

    event
}
