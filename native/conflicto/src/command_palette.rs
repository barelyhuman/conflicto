//! Simple searchable command palette (⌘/Ctrl+P).

use conflicto_core::UiVars;
use gpui::prelude::*;
use gpui::*;

use crate::color::rgb3;

#[derive(Clone)]
pub struct PaletteCommand {
    pub id: &'static str,
    pub label: SharedString,
    pub shortcut: SharedString,
}

pub struct CommandPalette {
    focus_handle: FocusHandle,
    open: bool,
    query: String,
    cursor: usize,
    selected: usize,
    commands: Vec<PaletteCommand>,
    ui: UiVars,
}

pub enum CommandPaletteEvent {
    Run(&'static str),
    Closed,
}

impl CommandPalette {
    pub fn new(ui: &UiVars, cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            open: false,
            query: String::new(),
            cursor: 0,
            selected: 0,
            commands: default_commands(),
            ui: ui.clone(),
        }
    }

    pub fn set_ui(&mut self, ui: &UiVars) {
        self.ui = ui.clone();
    }

    pub fn open(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open = true;
        self.query.clear();
        self.cursor = 0;
        self.selected = 0;
        window.focus(&self.focus_handle);
        cx.notify();
    }

    pub fn close(&mut self, cx: &mut Context<Self>) {
        if self.open {
            self.open = false;
            self.query.clear();
            cx.emit(CommandPaletteEvent::Closed);
            cx.notify();
        }
    }

    pub fn toggle(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.open {
            self.close(cx);
        } else {
            self.open(window, cx);
        }
    }

    fn filtered(&self) -> Vec<&PaletteCommand> {
        let q = self.query.to_ascii_lowercase();
        self.commands
            .iter()
            .filter(|c| {
                q.is_empty()
                    || c.label.to_ascii_lowercase().contains(&q)
                    || c.id.contains(&q)
            })
            .collect()
    }

    fn run_selected(&mut self, cx: &mut Context<Self>) {
        let filtered = self.filtered();
        if filtered.is_empty() {
            return;
        }
        let idx = self.selected.min(filtered.len() - 1);
        let id = filtered[idx].id;
        self.open = false;
        self.query.clear();
        cx.emit(CommandPaletteEvent::Run(id));
        cx.notify();
    }

    fn on_key_down(&mut self, event: &KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        if !self.open {
            return;
        }
        let key = event.keystroke.key.as_str();
        if key == "escape" {
            self.close(cx);
            return;
        }
        if key == "enter" {
            self.run_selected(cx);
            return;
        }
        if key == "up" {
            if self.selected > 0 {
                self.selected -= 1;
                cx.notify();
            }
            return;
        }
        if key == "down" {
            let n = self.filtered().len();
            if n > 0 && self.selected + 1 < n {
                self.selected += 1;
                cx.notify();
            }
            return;
        }
        if key == "backspace" {
            if self.cursor > 0 {
                let end = self
                    .query
                    .char_indices()
                    .nth(self.cursor)
                    .map(|(i, _)| i)
                    .unwrap_or(self.query.len());
                let start = self
                    .query
                    .char_indices()
                    .nth(self.cursor - 1)
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                self.query.replace_range(start..end, "");
                self.cursor -= 1;
                self.selected = 0;
                cx.notify();
            }
            return;
        }
        if event.keystroke.modifiers.control || event.keystroke.modifiers.platform {
            return;
        }
        if key == "space" {
            let byte = self
                .query
                .char_indices()
                .nth(self.cursor)
                .map(|(i, _)| i)
                .unwrap_or(self.query.len());
            self.query.insert(byte, ' ');
            self.cursor += 1;
            self.selected = 0;
            cx.notify();
            return;
        }
        if key.len() == 1 {
            let ch = key.chars().next().unwrap();
            if !ch.is_control() {
                let byte = self
                    .query
                    .char_indices()
                    .nth(self.cursor)
                    .map(|(i, _)| i)
                    .unwrap_or(self.query.len());
                self.query.insert(byte, ch);
                self.cursor += 1;
                self.selected = 0;
                cx.notify();
            }
        }
    }
}

fn default_commands() -> Vec<PaletteCommand> {
    vec![
        PaletteCommand {
            id: "open_repo",
            label: "Open repository".into(),
            shortcut: "⌘/Ctrl+O".into(),
        },
        PaletteCommand {
            id: "refresh",
            label: "Refresh".into(),
            shortcut: "⌘/Ctrl+R".into(),
        },
        PaletteCommand {
            id: "save",
            label: "Save unstaged edits".into(),
            shortcut: "⌘/Ctrl+S".into(),
        },
        PaletteCommand {
            id: "toggle_sxs",
            label: "Toggle side-by-side".into(),
            shortcut: "⌘/Ctrl+\\".into(),
        },
        PaletteCommand {
            id: "commit",
            label: "Commit staged changes".into(),
            shortcut: "⌘/Ctrl+Enter".into(),
        },
        PaletteCommand {
            id: "fetch",
            label: "Fetch".into(),
            shortcut: "".into(),
        },
        PaletteCommand {
            id: "pull",
            label: "Pull (ff-only)".into(),
            shortcut: "".into(),
        },
        PaletteCommand {
            id: "push",
            label: "Push".into(),
            shortcut: "".into(),
        },
        PaletteCommand {
            id: "view_changes",
            label: "Show Changes".into(),
            shortcut: "".into(),
        },
        PaletteCommand {
            id: "view_graph",
            label: "Show Graph".into(),
            shortcut: "".into(),
        },
        PaletteCommand {
            id: "view_prs",
            label: "Show Pull Requests".into(),
            shortcut: "".into(),
        },
        PaletteCommand {
            id: "quit",
            label: "Quit".into(),
            shortcut: "⌘Q / Alt+F4".into(),
        },
    ]
}

impl EventEmitter<CommandPaletteEvent> for CommandPalette {}

impl Focusable for CommandPalette {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl Render for CommandPalette {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if !self.open {
            return div().into_any_element();
        }
        let u = self.ui.clone();
        let filtered = self.filtered();
        let selected = if filtered.is_empty() {
            0
        } else {
            self.selected.min(filtered.len() - 1)
        };
        let query = self.query.clone();

        div()
            .id("command-palette-root")
            .absolute()
            .inset_0()
            .flex()
            .items_start()
            .justify_center()
            .pt(px(80.))
            .bg(rgba(0x00000066))
            .occlude()
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(Self::on_key_down))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    this.close(cx);
                }),
            )
            .child(
                div()
                    .id("command-palette")
                    .w(px(480.))
                    .max_h(px(420.))
                    .rounded_md()
                    .border_1()
                    .border_color(rgb3(u.border))
                    .bg(rgb3(u.bg_surface))
                    .shadow_lg()
                    .flex()
                    .flex_col()
                    .on_mouse_down(MouseButton::Left, |_, _, _| {})
                    .child(
                        div()
                            .px_3()
                            .py_2()
                            .border_b_1()
                            .border_color(rgb3(u.border))
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(rgb3(u.text))
                                    .child(if query.is_empty() {
                                        SharedString::from("Type a command…")
                                    } else {
                                        SharedString::from(query)
                                    }),
                            ),
                    )
                    .child(
                        div()
                            .id("command-palette-list")
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_h_0()
                            .overflow_scroll()
                            .py_1()
                            .children(filtered.into_iter().enumerate().map(|(i, cmd)| {
                                let id = cmd.id;
                                let label = cmd.label.clone();
                                let shortcut = cmd.shortcut.clone();
                                let is_sel = i == selected;
                                let u = u.clone();
                                div()
                                    .id(SharedString::from(format!("cmd-{id}")))
                                    .flex()
                                    .flex_row()
                                    .items_center()
                                    .justify_between()
                                    .h(px(32.))
                                    .px_3()
                                    .when(is_sel, |el| el.bg(rgb3(u.bg_active)))
                                    .cursor_pointer()
                                    .hover(|s| s.bg(rgb3(u.bg_hover)))
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.open = false;
                                        this.query.clear();
                                        cx.emit(CommandPaletteEvent::Run(id));
                                        cx.notify();
                                    }))
                                    .child(
                                        div()
                                            .text_sm()
                                            .text_color(rgb3(u.text))
                                            .child(label),
                                    )
                                    .child(
                                        div()
                                            .text_xs()
                                            .text_color(rgb3(u.text_muted))
                                            .child(shortcut),
                                    )
                            })),
                    ),
            )
            .into_any_element()
    }
}
