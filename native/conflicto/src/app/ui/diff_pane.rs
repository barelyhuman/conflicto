use crate::app::ConflictoApp;
use crate::diff_widget::{self, DiffWidgetOutcome};
use conflicto_core::UiVars;
use egui::Ui;

pub fn show(ui: &mut Ui, app: &mut ConflictoApp, u: &UiVars) {
    let Some(diff) = app.session.diff.clone() else {
        return;
    };
    let editable = app.can_edit();
    let palette = app.hl_palette.clone();
    let edit = if editable {
        Some(&mut app.session.edit_buffer)
    } else {
        None
    };

    let outcome: DiffWidgetOutcome = if app.side_by_side {
        diff_widget::show_side_by_side(
            ui,
            u,
            &palette,
            &diff.path,
            &diff.original,
            &diff.modified,
            edit,
            &mut app.session.scroll,
            &mut app.session.cache,
        )
    } else {
        diff_widget::show_inline(
            ui,
            u,
            &palette,
            &diff.path,
            &diff.original,
            &diff.modified,
            edit,
            &mut app.session.scroll,
            &mut app.session.cache,
        )
    };

    if outcome.buffer_changed {
        app.session.dirty = app.session.edit_buffer != diff.modified;
        app.status = None;
    }
}
