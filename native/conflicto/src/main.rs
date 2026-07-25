mod app;

use app::ConflictoApp;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280.0, 800.0])
            .with_min_inner_size([800.0, 500.0])
            .with_title("Conflicto"),
        ..Default::default()
    };
    eframe::run_native(
        "Conflicto",
        options,
        Box::new(|cc| Ok(Box::new(ConflictoApp::new(cc)))),
    )
}
