mod app;
mod diff_widget;
mod ui_kit;

use app::ConflictoApp;

fn main() -> eframe::Result<()> {
    let mut viewport = egui::ViewportBuilder::default()
        .with_inner_size([1280.0, 800.0])
        .with_min_inner_size([800.0, 500.0])
        .with_title("Conflicto");

    #[cfg(target_os = "macos")]
    {
        viewport = viewport
            .with_fullsize_content_view(true)
            .with_titlebar_shown(false)
            .with_title_shown(false)
            .with_titlebar_buttons_shown(true);
    }

    let options = eframe::NativeOptions {
        viewport,
        ..Default::default()
    };
    eframe::run_native(
        "Conflicto",
        options,
        Box::new(|cc| Ok(Box::new(ConflictoApp::new(cc)))),
    )
}
