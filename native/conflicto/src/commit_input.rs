//! Single-line commit message field (GPUI has no built-in TextInput).

use conflicto_core::UiVars;
use gpui::prelude::*;
use gpui::*;

use crate::color::rgb3;

pub struct CommitMessageField {
    focus_handle: FocusHandle,
    content: String,
    cursor: usize,
    ui: UiVars,
}

pub enum CommitMessageEvent {
    Changed(String),
}

impl CommitMessageField {
    pub fn new(ui: &UiVars, cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            content: String::new(),
            cursor: 0,
            ui: ui.clone(),
        }
    }

    pub fn set_ui(&mut self, ui: &UiVars) {
        self.ui = ui.clone();
    }

    pub fn content(&self) -> &str {
        &self.content
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        if !self.content.is_empty() {
            self.content.clear();
            self.cursor = 0;
            cx.emit(CommitMessageEvent::Changed(String::new()));
            cx.notify();
        }
    }

    fn emit_changed(&mut self, cx: &mut Context<Self>) {
        cx.emit(CommitMessageEvent::Changed(self.content.clone()));
        cx.notify();
    }

    fn insert_str(&mut self, s: &str, cx: &mut Context<Self>) {
        // Single-line field: drop newlines from IME / multi-char input.
        let filtered: String = s.chars().filter(|c| *c != '\n' && *c != '\r').collect();
        if filtered.is_empty() {
            return;
        }
        let byte = self.byte_at_cursor();
        let n = filtered.chars().count();
        self.content.insert_str(byte, &filtered);
        self.cursor += n;
        self.emit_changed(cx);
    }

    fn byte_at_cursor(&self) -> usize {
        self.content
            .char_indices()
            .nth(self.cursor)
            .map(|(i, _)| i)
            .unwrap_or(self.content.len())
    }

    fn on_key_down(&mut self, event: &KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        let key = event.keystroke.key.as_str();
        if key == "backspace" {
            if self.cursor == 0 {
                return;
            }
            let end = self.byte_at_cursor();
            let start = self
                .content
                .char_indices()
                .nth(self.cursor - 1)
                .map(|(i, _)| i)
                .unwrap_or(0);
            self.content.replace_range(start..end, "");
            self.cursor -= 1;
            self.emit_changed(cx);
            return;
        }
        if key == "left" {
            if self.cursor > 0 {
                self.cursor -= 1;
                cx.notify();
            }
            return;
        }
        if key == "right" {
            if self.cursor < self.content.chars().count() {
                self.cursor += 1;
                cx.notify();
            }
            return;
        }
        if key == "enter" {
            // Commit is ⌘/Ctrl+Enter via app action; plain Enter is ignored (single-line).
            return;
        }
        if event.keystroke.modifiers.control || event.keystroke.modifiers.platform {
            return;
        }
        if let Some(ch) = event.keystroke.key_char.as_deref() {
            self.insert_str(ch, cx);
            return;
        }
        if key == "space" {
            self.insert_str(" ", cx);
            return;
        }
        if key.len() == 1 {
            let ch = key.chars().next().unwrap();
            if !ch.is_control() {
                self.insert_str(&ch.to_string(), cx);
            }
        }
    }
}

impl EventEmitter<CommitMessageEvent> for CommitMessageField {}

impl Focusable for CommitMessageField {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl Render for CommitMessageField {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let u = self.ui.clone();
        let focused = self.focus_handle.is_focused(window);
        let content = self.content.clone();
        let cursor = self.cursor;
        let empty = content.is_empty();

        let display = if empty && !focused {
            String::new()
        } else if focused {
            let mut t = content.clone();
            let byte = t
                .char_indices()
                .nth(cursor)
                .map(|(b, _)| b)
                .unwrap_or(t.len());
            t.insert(byte, '│');
            t
        } else {
            content.clone()
        };

        div()
            .id("commit-message")
            .track_focus(&self.focus_handle)
            .flex()
            .flex_row()
            .items_center()
            .w_full()
            .min_h(px(32.))
            .px_2()
            .py_1()
            .rounded_sm()
            .border_1()
            .border_color(rgb3(if focused { u.accent } else { u.border }))
            .bg(rgb3(u.bg))
            .cursor_text()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, _, window, cx| {
                    window.focus(&this.focus_handle);
                    this.cursor = this.content.chars().count();
                    cx.notify();
                }),
            )
            .on_key_down(cx.listener(Self::on_key_down))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .text_sm()
                    .overflow_hidden()
                    .text_ellipsis()
                    .text_color(rgb3(if empty && !focused {
                        u.text_muted
                    } else {
                        u.text
                    }))
                    .child(if empty && !focused {
                        SharedString::from("Commit message")
                    } else if display.is_empty() {
                        SharedString::from("│")
                    } else {
                        SharedString::from(display)
                    }),
            )
    }
}
