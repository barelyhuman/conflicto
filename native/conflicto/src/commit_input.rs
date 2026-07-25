//! Single-line commit message field (GPUI has no built-in TextInput).

use std::ops::Range;
use std::time::Duration;

use conflicto_core::UiVars;
use gpui::prelude::*;
use gpui::*;

use crate::color::rgb3;

pub struct CommitMessageField {
    focus_handle: FocusHandle,
    content: String,
    /// Character offset of the caret (and selection end when selecting).
    cursor: usize,
    /// Character offset of selection start; equal to cursor when collapsed.
    sel_start: usize,
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
            sel_start: 0,
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
            self.sel_start = 0;
            cx.emit(CommitMessageEvent::Changed(String::new()));
            cx.notify();
        }
    }

    fn emit_changed(&mut self, cx: &mut Context<Self>) {
        cx.emit(CommitMessageEvent::Changed(self.content.clone()));
        cx.notify();
    }

    fn selection(&self) -> Range<usize> {
        if self.sel_start <= self.cursor {
            self.sel_start..self.cursor
        } else {
            self.cursor..self.sel_start
        }
    }

    fn byte_at(&self, char_idx: usize) -> usize {
        self.content
            .char_indices()
            .nth(char_idx)
            .map(|(i, _)| i)
            .unwrap_or(self.content.len())
    }

    fn delete_selection(&mut self) -> bool {
        let sel = self.selection();
        if sel.start == sel.end {
            return false;
        }
        let start = self.byte_at(sel.start);
        let end = self.byte_at(sel.end);
        self.content.replace_range(start..end, "");
        self.cursor = sel.start;
        self.sel_start = sel.start;
        true
    }

    fn insert_str(&mut self, s: &str, cx: &mut Context<Self>) {
        let filtered: String = s.chars().filter(|c| *c != '\n' && *c != '\r').collect();
        if filtered.is_empty() {
            return;
        }
        self.delete_selection();
        let byte = self.byte_at(self.cursor);
        let n = filtered.chars().count();
        self.content.insert_str(byte, &filtered);
        self.cursor += n;
        self.sel_start = self.cursor;
        self.emit_changed(cx);
    }

    fn select_all(&mut self, cx: &mut Context<Self>) {
        self.sel_start = 0;
        self.cursor = self.content.chars().count();
        cx.notify();
    }

    fn copy(&mut self, cx: &mut Context<Self>) {
        let sel = self.selection();
        if sel.start == sel.end {
            return;
        }
        let start = self.byte_at(sel.start);
        let end = self.byte_at(sel.end);
        cx.write_to_clipboard(ClipboardItem::new_string(
            self.content[start..end].to_string(),
        ));
    }

    fn cut(&mut self, cx: &mut Context<Self>) {
        let sel = self.selection();
        if sel.start == sel.end {
            return;
        }
        let start = self.byte_at(sel.start);
        let end = self.byte_at(sel.end);
        cx.write_to_clipboard(ClipboardItem::new_string(
            self.content[start..end].to_string(),
        ));
        self.delete_selection();
        self.emit_changed(cx);
    }

    fn paste(&mut self, cx: &mut Context<Self>) {
        if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
            self.insert_str(&text, cx);
        }
    }

    fn on_key_down(&mut self, event: &KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        let key = event.keystroke.key.as_str();
        let mods = &event.keystroke.modifiers;
        let shift = mods.shift;
        let chord = mods.control || mods.platform;

        if chord {
            match key {
                "a" => {
                    self.select_all(cx);
                    return;
                }
                "c" => {
                    self.copy(cx);
                    return;
                }
                "x" => {
                    self.cut(cx);
                    return;
                }
                "v" => {
                    self.paste(cx);
                    return;
                }
                _ => return,
            }
        }

        if key == "backspace" {
            if self.delete_selection() {
                self.emit_changed(cx);
                return;
            }
            if self.cursor == 0 {
                return;
            }
            let end = self.byte_at(self.cursor);
            let start = self.byte_at(self.cursor - 1);
            self.content.replace_range(start..end, "");
            self.cursor -= 1;
            self.sel_start = self.cursor;
            self.emit_changed(cx);
            return;
        }
        if key == "left" {
            if self.cursor > 0 {
                self.cursor -= 1;
            }
            if !shift {
                self.sel_start = self.cursor;
            }
            cx.notify();
            return;
        }
        if key == "right" {
            if self.cursor < self.content.chars().count() {
                self.cursor += 1;
            }
            if !shift {
                self.sel_start = self.cursor;
            }
            cx.notify();
            return;
        }
        if key == "home" {
            self.cursor = 0;
            if !shift {
                self.sel_start = 0;
            }
            cx.notify();
            return;
        }
        if key == "end" {
            self.cursor = self.content.chars().count();
            if !shift {
                self.sel_start = self.cursor;
            }
            cx.notify();
            return;
        }
        if key == "enter" {
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
        let sel = self.selection();
        let empty = content.is_empty();

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
                    this.sel_start = this.cursor;
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
                        SharedString::from("Commit message").into_any_element()
                    } else {
                        render_line_with_selection(&content, sel, cursor, focused, &u)
                            .into_any_element()
                    }),
            )
    }
}

fn render_line_with_selection(
    content: &str,
    sel: Range<usize>,
    cursor: usize,
    focused: bool,
    u: &UiVars,
) -> impl IntoElement {
    let chars: Vec<char> = content.chars().collect();
    let mut children: Vec<AnyElement> = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if focused && sel.start != sel.end && i >= sel.start && i < sel.end {
            let mut chunk = String::new();
            while i < chars.len() && i < sel.end {
                chunk.push(chars[i]);
                i += 1;
            }
            children.push(
                div()
                    .bg(rgb3(u.accent))
                    .text_color(rgb3(u.btn_fg))
                    .child(chunk)
                    .into_any_element(),
            );
            continue;
        }
        if focused && i == cursor && sel.start == sel.end {
            children.push(blinking_caret(u).into_any_element());
        }
        children.push(div().child(chars[i].to_string()).into_any_element());
        i += 1;
    }
    if focused && cursor >= chars.len() && sel.start == sel.end {
        children.push(blinking_caret(u).into_any_element());
    }
    if children.is_empty() {
        if focused {
            children.push(blinking_caret(u).into_any_element());
        } else {
            children.push(div().child(" ").into_any_element());
        }
    }
    div().flex().flex_row().children(children)
}

fn blinking_caret(u: &UiVars) -> impl IntoElement {
    div()
        .w(px(2.))
        .h(px(14.))
        .bg(rgb3(u.text))
        .with_animation(
            "caret-blink",
            Animation::new(Duration::from_millis(1060)).repeat(),
            |this, delta| {
                if delta < 0.5 {
                    this.opacity(1.0)
                } else {
                    this.opacity(0.0)
                }
            },
        )
}
