//! Root GPUI window: chrome + diff wired to `conflicto_core::AppState`.

use std::path::Path;

use conflicto_core::{themes, AppState, ChangeEntry, ChangeSide, CommitFile, ViewMode};
use gpui::prelude::*;
use gpui::*;

use crate::actions::{OpenRepo, Refresh, Save, ToggleSideBySide};
use crate::color::rgb3;
use crate::diff::{DiffPane, DiffPaneEvent};

pub struct ConflictoApp {
    state: AppState,
    diff: Entity<DiffPane>,
    repo_menu_open: bool,
    theme_menu_open: bool,
    settings_menu_open: bool,
    focus_handle: FocusHandle,
}

impl ConflictoApp {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let state = AppState::new();
        let diff = cx.new(DiffPane::new);
        let mut app = Self {
            state,
            diff: diff.clone(),
            repo_menu_open: false,
            theme_menu_open: false,
            settings_menu_open: false,
            focus_handle: cx.focus_handle(),
        };
        cx.subscribe(&diff, Self::on_diff_event).detach();
        app.sync_diff(cx);
        window.focus(&app.focus_handle);
        app
    }

    fn sync_diff(&mut self, cx: &mut Context<Self>) {
        let editable = self.state.session.can_edit();
        let side_by_side = self.state.side_by_side;
        let ui = self.state.ui_vars.clone();
        let palette = self.state.hl_palette.clone();
        let (path, original, modified, edit) =
            if let Some(diff) = self.state.session.diff.as_ref() {
                (
                    diff.path.clone(),
                    diff.original.clone(),
                    diff.modified.clone(),
                    if editable {
                        Some(self.state.session.edit_buffer.clone())
                    } else {
                        None
                    },
                )
            } else {
                (String::new(), String::new(), String::new(), None)
            };

        self.diff.update(cx, |pane, _cx| {
            pane.bind(
                &path,
                &original,
                &modified,
                edit.as_deref(),
                editable,
                side_by_side,
                &ui,
                &palette,
            );
        });
    }

    fn open_repo_dialog(&mut self, cx: &mut Context<Self>) {
        if let Some(path) = rfd::FileDialog::new().pick_folder() {
            self.state.open_repo_path(&path.to_string_lossy());
            self.repo_menu_open = false;
            self.sync_diff(cx);
            cx.notify();
        }
    }

    fn open_repo(&mut self, _: &OpenRepo, _window: &mut Window, cx: &mut Context<Self>) {
        self.open_repo_dialog(cx);
    }

    fn refresh(&mut self, _: &Refresh, _window: &mut Window, cx: &mut Context<Self>) {
        if !self.state.guard_dirty() {
            cx.notify();
            return;
        }
        self.state.refresh_all();
        self.sync_diff(cx);
        cx.notify();
    }

    fn save(&mut self, _: &Save, _window: &mut Window, cx: &mut Context<Self>) {
        self.state.save_edit();
        self.sync_diff(cx);
        cx.notify();
    }

    fn toggle_sxs(&mut self, _: &ToggleSideBySide, _window: &mut Window, cx: &mut Context<Self>) {
        self.state.side_by_side = !self.state.side_by_side;
        self.sync_diff(cx);
        cx.notify();
    }

    fn on_diff_event(
        &mut self,
        _diff: Entity<DiffPane>,
        event: &DiffPaneEvent,
        cx: &mut Context<Self>,
    ) {
        match event {
            DiffPaneEvent::BufferChanged(buf) => {
                self.state.session.edit_buffer = buf.clone();
                self.state.session.mark_buffer_changed();
                cx.notify();
            }
        }
    }
}

impl Render for ConflictoApp {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let u = self.state.ui_vars.clone();
        let status = self
            .state
            .status
            .clone()
            .or_else(|| self.state.error.clone())
            .unwrap_or_default();

        div()
            .id("root")
            .track_focus(&self.focus_handle)
            .flex()
            .flex_row()
            .size_full()
            .bg(rgb3(u.bg))
            .text_color(rgb3(u.text))
            .font_family(".SystemUIFont")
            .on_action(cx.listener(Self::open_repo))
            .on_action(cx.listener(Self::refresh))
            .on_action(cx.listener(Self::save))
            .on_action(cx.listener(Self::toggle_sxs))
            .child(
                div()
                    .flex()
                    .flex_1()
                    .flex_col()
                    .min_w_0()
                    .child(toolbar(self, cx))
                    .child(
                        div()
                            .flex()
                            .flex_1()
                            .min_h_0()
                            .child(self.diff.clone()),
                    )
                    .when(!status.is_empty(), |el| {
                        el.child(
                            div()
                                .h(px(24.))
                                .px_3()
                                .flex()
                                .items_center()
                                .bg(rgb3(u.bg_surface))
                                .text_xs()
                                .text_color(rgb3(u.text_muted))
                                .child(status),
                        )
                    }),
            )
            .child(sidebar(self, cx))
    }
}

fn toolbar(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let dirty = app.state.session.dirty;
    let theme_open = app.theme_menu_open;
    let settings_open = app.settings_menu_open;
    let current = app.state.prefs.theme_id;
    let sxs = app.state.side_by_side;

    let theme_menu = theme_open.then(|| {
        let u = u.clone();
        div()
            .id("theme-menu")
            .flex()
            .flex_col()
            .w_full()
            .border_t_1()
            .border_color(rgb3(u.border))
            .bg(rgb3(u.bg))
            .py_1()
            .children(themes().iter().map(|pack| {
                let id = pack.id;
                let selected = id == current;
                div()
                    .id(SharedString::from(format!("theme-opt-{}", id.label())))
                    .flex()
                    .items_center()
                    .justify_end()
                    .h(px(28.))
                    .px_3()
                    .cursor_pointer()
                    .when(selected, |el| el.bg(rgb3(u.bg_active)))
                    .hover(|s| s.bg(rgb3(u.bg_hover)))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.state.set_theme(id);
                        this.theme_menu_open = false;
                        this.sync_diff(cx);
                        cx.notify();
                    }))
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb3(if selected { u.accent } else { u.text }))
                            .child(id.label()),
                    )
            }))
            .into_any_element()
    });

    let settings_menu = settings_open.then(|| {
        let u = u.clone();
        div()
            .id("settings-menu")
            .flex()
            .flex_col()
            .w_full()
            .border_t_1()
            .border_color(rgb3(u.border))
            .bg(rgb3(u.bg))
            .p_2()
            .child(
                div()
                    .id("sxs-toggle")
                    .flex()
                    .flex_row()
                    .items_center()
                    .justify_end()
                    .gap_2()
                    .h(px(28.))
                    .px_1()
                    .rounded_sm()
                    .cursor_pointer()
                    .hover(|s| s.bg(rgb3(u.bg_hover)))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.state.side_by_side = !this.state.side_by_side;
                        this.sync_diff(cx);
                        cx.notify();
                    }))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_center()
                            .size(px(16.))
                            .rounded_sm()
                            .border_1()
                            .border_color(rgb3(if sxs { u.accent } else { u.border }))
                            .bg(rgb3(if sxs { u.accent } else { u.bg }))
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(rgb3(if sxs { u.btn_fg } else { u.bg }))
                                    .child(if sxs { "✓" } else { " " }),
                            ),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb3(u.text))
                            .child("Side by side"),
                    ),
            )
            .into_any_element()
    });

    div()
        .flex()
        .flex_col()
        .w_full()
        .bg(rgb3(u.bg_surface))
        .child(
            div()
                .flex()
                .flex_row()
                .min_h(px(42.))
                .items_center()
                .gap_2()
                .px_3()
                .child(
                    div()
                        .flex_1()
                        .text_xs()
                        .text_color(rgb3(u.text_muted))
                        .child(if dirty { "• Unsaved edits" } else { "" }),
                )
                .child(
                    div()
                        .id("theme-dropdown")
                        .flex()
                        .items_center()
                        .gap_1()
                        .h(px(28.))
                        .px_2()
                        .rounded_sm()
                        .border_1()
                        .border_color(rgb3(u.border))
                        .bg(rgb3(u.bg))
                        .cursor_pointer()
                        .hover(|s| s.bg(rgb3(u.bg_hover)))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.theme_menu_open = !this.theme_menu_open;
                            this.settings_menu_open = false;
                            cx.notify();
                        }))
                        .child(
                            div()
                                .text_xs()
                                .text_color(rgb3(u.text))
                                .child(current.label()),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(rgb3(u.text_muted))
                                .child(if theme_open { "▴" } else { "▾" }),
                        ),
                )
                .child(
                    div()
                        .id("settings-cog")
                        .flex()
                        .items_center()
                        .justify_center()
                        .size(px(28.))
                        .rounded_sm()
                        .border_1()
                        .border_color(rgb3(u.border))
                        .bg(rgb3(if settings_open { u.bg_active } else { u.bg }))
                        .cursor_pointer()
                        .hover(|s| s.bg(rgb3(u.bg_hover)))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.settings_menu_open = !this.settings_menu_open;
                            this.theme_menu_open = false;
                            cx.notify();
                        }))
                        .child(
                            div()
                                .text_sm()
                                .text_color(rgb3(u.text))
                                .child("⚙"),
                        ),
                ),
        )
        .children(theme_menu)
        .children(settings_menu)
}

fn sidebar(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    div()
        .flex()
        .flex_col()
        .w(px(320.))
        .h_full()
        .bg(rgb3(u.bg_sidebar))
        .child(repo_header(app, cx))
        .child(view_tabs(app, cx))
        .child(
            div()
                .flex()
                .flex_1()
                .min_h_0()
                .flex_col()
                .child(match app.state.view_mode {
                    ViewMode::Changes => changes_list(app, cx).into_any_element(),
                    ViewMode::Graph => graph_list(app, cx).into_any_element(),
                }),
        )
}

fn repo_header(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let label = app
        .state
        .repo
        .as_ref()
        .map(|r| {
            Path::new(&r.root)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("repo")
                .to_string()
        })
        .unwrap_or_else(|| "Open repo…".into());
    let branch = app
        .state
        .repo
        .as_ref()
        .map(|r| r.branch.clone())
        .unwrap_or_default();
    let menu_open = app.repo_menu_open;

    div()
        .flex()
        .flex_col()
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap_2()
                .h(px(42.))
                .px_3()
                .bg(rgb3(u.bg_surface))
                .child(
                    div()
                        .id("repo-switcher")
                        .flex_1()
                        .min_w_0()
                        .px_2()
                        .py_1()
                        .rounded_sm()
                        .border_1()
                        .border_color(rgb3(u.border))
                        .bg(rgb3(u.bg))
                        .cursor_pointer()
                        .hover(|s| s.bg(rgb3(u.bg_hover)))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.repo_menu_open = !this.repo_menu_open;
                            this.theme_menu_open = false;
                            this.settings_menu_open = false;
                            cx.notify();
                        }))
                        .child(
                            div()
                                .text_sm()
                                .font_weight(FontWeight::SEMIBOLD)
                                .overflow_hidden()
                                .text_ellipsis()
                                .child(label),
                        ),
                )
                .child(
                    div()
                        .id("refresh")
                        .flex()
                        .items_center()
                        .justify_center()
                        .size(px(30.))
                        .rounded_sm()
                        .border_1()
                        .border_color(rgb3(u.border))
                        .bg(rgb3(u.bg))
                        .cursor_pointer()
                        .hover(|s| s.bg(rgb3(u.bg_hover)))
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.refresh(&Refresh, window, cx);
                        }))
                        .child("↻"),
                ),
        )
        .when(!branch.is_empty(), |el| {
            el.child(
                div()
                    .px_3()
                    .pb_1()
                    .text_xs()
                    .text_color(rgb3(u.text_muted))
                    .child(branch),
            )
        })
        .when(menu_open, |el| el.child(repo_menu(app, cx)))
}

fn repo_menu(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let recent = app.state.recent.clone();
    let current = app.state.repo.as_ref().map(|r| r.root.clone());

    div()
        .flex()
        .flex_col()
        .mx_2()
        .mb_2()
        .rounded_sm()
        .border_1()
        .border_color(rgb3(u.border))
        .bg(rgb3(u.bg))
        .child(
            div()
                .id("browse-repo")
                .px_2()
                .py_1()
                .cursor_pointer()
                .hover(|s| s.bg(rgb3(u.bg_hover)))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.open_repo_dialog(cx);
                }))
                .child("Browse…"),
        )
        .children(recent.into_iter().map(|r| {
            let root = r.root.clone();
            let name = r.name.clone();
            let selected = current.as_ref() == Some(&root);
            div()
                .id(SharedString::from(format!("recent-{root}")))
                .flex()
                .flex_row()
                .items_center()
                .h(px(28.))
                .px_2()
                .when(selected, |el| el.bg(rgb3(u.bg_active)))
                .cursor_pointer()
                .hover(|s| s.bg(rgb3(u.bg_hover)))
                .child(
                    div()
                        .id(SharedString::from(format!("open-{root}")))
                        .flex_1()
                        .min_w_0()
                        .text_sm()
                        .overflow_hidden()
                        .text_ellipsis()
                        .on_click(cx.listener({
                            let root = root.clone();
                            move |this, _, _, cx| {
                                this.state.open_repo_path(&root);
                                this.repo_menu_open = false;
                                this.sync_diff(cx);
                                cx.notify();
                            }
                        }))
                        .child(name),
                )
                .child(
                    div()
                        .id(SharedString::from(format!("forget-{root}")))
                        .px_1()
                        .text_color(rgb3(u.text_muted))
                        .cursor_pointer()
                        .on_click(cx.listener({
                            let root = root.clone();
                            move |this, _, _, cx| {
                                this.state.forget_recent(&root);
                                cx.notify();
                            }
                        }))
                        .child("×"),
                )
        }))
}

fn view_tabs(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let mode = app.state.view_mode;
    div()
        .flex()
        .flex_row()
        .gap_1()
        .px_2()
        .py_1()
        .child(tab_btn("Changes", mode == ViewMode::Changes, u.clone(), cx, ViewMode::Changes))
        .child(tab_btn("Graph", mode == ViewMode::Graph, u, cx, ViewMode::Graph))
}

fn tab_btn(
    label: &'static str,
    selected: bool,
    u: conflicto_core::UiVars,
    cx: &mut Context<ConflictoApp>,
    mode: ViewMode,
) -> impl IntoElement {
    div()
        .id(label)
        .px_2()
        .py_1()
        .rounded_sm()
        .when(selected, |el| el.bg(rgb3(u.bg_active)))
        .cursor_pointer()
        .hover(|s| s.bg(rgb3(u.bg_hover)))
        .on_click(cx.listener(move |this, _, _, cx| {
            if !this.state.guard_dirty() {
                cx.notify();
                return;
            }
            this.state.view_mode = mode;
            cx.notify();
        }))
        .child(
            div()
                .text_sm()
                .font_weight(if selected {
                    FontWeight::SEMIBOLD
                } else {
                    FontWeight::NORMAL
                })
                .child(label),
        )
}

fn changes_list(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let staged: Vec<_> = app
        .state
        .changes
        .iter()
        .filter(|c| c.side == ChangeSide::Staged)
        .cloned()
        .collect();
    let unstaged: Vec<_> = app
        .state
        .changes
        .iter()
        .filter(|c| c.side == ChangeSide::Unstaged)
        .cloned()
        .collect();
    div()
        .id("changes")
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .overflow_scroll()
        .p_2()
        .gap_2()
        .child(section_label("Staged", &u))
        .children(
            staged
                .into_iter()
                .map(|e| change_row(e, &u, &app.state.session, true, cx)),
        )
        .child(section_label("Changes", &u))
        .children(
            unstaged
                .into_iter()
                .map(|e| change_row(e, &u, &app.state.session, false, cx)),
        )
}

fn section_label(text: &str, u: &conflicto_core::UiVars) -> impl IntoElement {
    div()
        .text_xs()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(rgb3(u.text_muted))
        .child(text.to_string())
}

fn change_row(
    entry: ChangeEntry,
    u: &conflicto_core::UiVars,
    session: &conflicto_core::DiffSession,
    staged: bool,
    cx: &mut Context<ConflictoApp>,
) -> impl IntoElement {
    let is_sel = session.is_change_selected(&entry);
    let path = entry.path.clone();
    let side = entry.side;
    let status = entry.status.letter();
    let status_color = entry.status.ui_color(u);
    let u = u.clone();

    div()
        .id(SharedString::from(format!("chg-{}-{:?}", path, side)))
        .flex()
        .flex_row()
        .items_center()
        .gap_1()
        .h(px(26.))
        .px_1()
        .rounded_sm()
        .when(is_sel, |el| el.bg(rgb3(u.bg_active)))
        .cursor_pointer()
        .hover(|s| s.bg(rgb3(u.bg_hover)))
        .on_click(cx.listener({
            let entry = entry.clone();
            move |this, _, _, cx| {
                this.state.select_change(&entry);
                this.sync_diff(cx);
                cx.notify();
            }
        }))
        .child(
            div()
                .w(px(14.))
                .text_xs()
                .font_weight(FontWeight::BOLD)
                .text_color(rgb3(status_color))
                .child(status),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .text_sm()
                .overflow_hidden()
                .text_ellipsis()
                .child(path.clone()),
        )
        .child(
            div()
                .id(SharedString::from(format!("stage-btn-{path}-{:?}", side)))
                .flex()
                .items_center()
                .justify_center()
                .size(px(22.))
                .rounded_sm()
                .border_1()
                .border_color(rgb3(u.border))
                .bg(rgb3(u.bg_surface))
                .text_xs()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(rgb3(u.text_muted))
                .cursor_pointer()
                .hover(|s| {
                    s.bg(rgb3(u.btn_bg))
                        .border_color(rgb3(u.accent))
                        .text_color(rgb3(u.accent))
                })
                .active(|s| s.bg(rgb3(u.bg_active)).opacity(0.85))
                .on_click(cx.listener({
                    let path = path.clone();
                    move |this, _, _, cx| {
                        cx.stop_propagation();
                        if staged {
                            this.state.unstage_selected(&path);
                        } else {
                            this.state.stage_selected(&path);
                        }
                        this.sync_diff(cx);
                        cx.notify();
                    }
                }))
                .child(if staged { "−" } else { "+" }),
        )
}

fn graph_list(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let rows = app.state.graph_rows.clone();
    let selected = app.state.selected_commit.clone();
    let commit_files = app.state.commit_files.clone();

    div()
        .id("graph")
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .overflow_scroll()
        .p_2()
        .gap_1()
        .children(rows.into_iter().map(|row| {
            let hash = row.commit.hash.clone();
            let short = row.commit.short_hash.clone();
            let subject = row.commit.subject.clone();
            let lane = row.lane;
            let is_sel = selected.as_ref() == Some(&hash);
            let u = u.clone();
            let files = if is_sel {
                commit_files.clone()
            } else {
                Vec::new()
            };
            let file_rows: Vec<_> = files
                .into_iter()
                .map(|f| commit_file_row(f, &u, cx))
                .collect();
            div()
                .id(SharedString::from(format!("commit-{hash}")))
                .flex()
                .flex_col()
                .rounded_sm()
                .when(is_sel, |el| el.bg(rgb3(u.bg_active)))
                .cursor_pointer()
                .hover(|s| s.bg(rgb3(u.bg_hover)))
                .on_click(cx.listener({
                    let hash = hash.clone();
                    move |this, _, _, cx| {
                        this.state.select_commit(&hash);
                        this.sync_diff(cx);
                        cx.notify();
                    }
                }))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap_1()
                        .px_1()
                        .h(px(28.))
                        .child(
                            div()
                                .text_xs()
                                .text_color(rgb3(u.text_muted))
                                .child(format!("{}", "│".repeat(lane.saturating_add(1)))),
                        )
                        .child(
                            div()
                                .text_xs()
                                .font_family("Menlo")
                                .text_color(rgb3(u.accent))
                                .child(short),
                        )
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .text_sm()
                                .overflow_hidden()
                                .text_ellipsis()
                                .child(subject),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .pl_4()
                        .pb_1()
                        .children(file_rows),
                )
        }))
}

fn commit_file_row(
    file: CommitFile,
    u: &conflicto_core::UiVars,
    cx: &mut Context<ConflictoApp>,
) -> impl IntoElement {
    let path = file.path.clone();
    let old_path = file.old_path.clone();
    let status = file.status.letter();
    let status_color = file.status.ui_color(u);
    let u = u.clone();
    div()
        .id(SharedString::from(format!("cfile-{path}")))
        .flex()
        .flex_row()
        .items_center()
        .gap_1()
        .h(px(24.))
        .px_1()
        .cursor_pointer()
        .hover(|s| s.bg(rgb3(u.bg_hover)))
        .on_click(cx.listener(move |this, _, _, cx| {
            this.state
                .select_commit_file(&path, old_path.as_deref());
            this.sync_diff(cx);
            cx.notify();
        }))
        .child(
            div()
                .w(px(14.))
                .text_xs()
                .text_color(rgb3(status_color))
                .child(status),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .text_xs()
                .overflow_hidden()
                .text_ellipsis()
                .child(file.path),
        )
}

pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("cmd-o", OpenRepo, None),
        KeyBinding::new("ctrl-o", OpenRepo, None),
        KeyBinding::new("cmd-r", Refresh, None),
        KeyBinding::new("ctrl-r", Refresh, None),
        KeyBinding::new("cmd-s", Save, None),
        KeyBinding::new("ctrl-s", Save, None),
        KeyBinding::new("cmd-\\", ToggleSideBySide, None),
        KeyBinding::new("ctrl-\\", ToggleSideBySide, None),
    ]);
}
