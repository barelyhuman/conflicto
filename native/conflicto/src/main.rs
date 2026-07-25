mod actions;
mod app;
mod color;
mod commit_input;
mod diff;

use gpui::*;

use crate::app::{bind_keys, ConflictoApp};

fn main() {
    Application::new().run(|cx: &mut App| {
        bind_keys(cx);
        cx.activate(true);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1280.), px(800.)),
                    cx,
                ))),
                window_min_size: Some(size(px(800.), px(500.))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Conflicto".into()),
                    // Hide the system titlebar chrome; keep macOS traffic lights.
                    appears_transparent: true,
                    traffic_light_position: Some(point(px(14.), px(14.))),
                }),
                ..Default::default()
            },
            |window, cx| cx.new(|cx| ConflictoApp::new(window, cx)),
        )
        .expect("open window");
    });
}
