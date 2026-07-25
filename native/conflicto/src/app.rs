//! Root GPUI window: chrome + diff wired to `conflicto_core::AppState`.

use std::path::Path;

use conflicto_core::{
    graph_row_glyph, themes, AppState, ChangeEntry, ChangeSide, CommitFile, ViewMode,
};
use gpui::prelude::*;
use gpui::*;

use crate::actions::{
    Commit, Fetch, OpenRepo, Pull, Push, Quit, Refresh, Save, ToggleCommandPalette,
    ToggleSideBySide,
};
use crate::color::rgb3;
use crate::command_palette::{CommandPalette, CommandPaletteEvent};
use crate::commit_input::{CommitMessageEvent, CommitMessageField};
use crate::diff::{DiffPane, DiffPaneEvent};

/// Left inset so toolbar content clears macOS traffic lights (transparent titlebar).
#[cfg(target_os = "macos")]
const TITLEBAR_LEFT_INSET: f32 = 78.0;
#[cfg(not(target_os = "macos"))]
const TITLEBAR_LEFT_INSET: f32 = 12.0;

pub struct ConflictoApp {
    state: AppState,
    diff: Entity<DiffPane>,
    commit_input: Entity<CommitMessageField>,
    palette: Entity<CommandPalette>,
    repo_menu_open: bool,
    theme_menu_open: bool,
    settings_menu_open: bool,
    branch_menu_open: bool,
    focus_handle: FocusHandle,
}

impl ConflictoApp {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let state = AppState::new();
        let ui = state.ui_vars.clone();
        let diff = cx.new(DiffPane::new);
        let commit_input = cx.new(|cx| CommitMessageField::new(&ui, cx));
        let palette = cx.new(|cx| CommandPalette::new(&ui, cx));
        let mut app = Self {
            state,
            diff: diff.clone(),
            commit_input: commit_input.clone(),
            palette: palette.clone(),
            repo_menu_open: false,
            theme_menu_open: false,
            settings_menu_open: false,
            branch_menu_open: false,
            focus_handle: cx.focus_handle(),
        };
        cx.subscribe(&diff, Self::on_diff_event).detach();
        cx.subscribe(&commit_input, Self::on_commit_input_event)
            .detach();
        cx.subscribe(&palette, Self::on_palette_event).detach();
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

    fn commit(&mut self, _: &Commit, _window: &mut Window, cx: &mut Context<Self>) {
        self.commit_staged(cx);
    }

    fn quit(&mut self, _: &Quit, _window: &mut Window, cx: &mut Context<Self>) {
        cx.quit();
    }

    fn toggle_palette(
        &mut self,
        _: &ToggleCommandPalette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.repo_menu_open = false;
        self.theme_menu_open = false;
        self.settings_menu_open = false;
        self.branch_menu_open = false;
        self.palette.update(cx, |p, cx| p.toggle(window, cx));
        cx.notify();
    }

    fn fetch(&mut self, _: &Fetch, _window: &mut Window, cx: &mut Context<Self>) {
        self.state.fetch_remote();
        self.sync_diff(cx);
        cx.notify();
    }

    fn pull(&mut self, _: &Pull, _window: &mut Window, cx: &mut Context<Self>) {
        self.state.pull_remote();
        self.sync_diff(cx);
        cx.notify();
    }

    fn push(&mut self, _: &Push, _window: &mut Window, cx: &mut Context<Self>) {
        self.state.push_remote();
        self.sync_diff(cx);
        cx.notify();
    }

    fn commit_staged(&mut self, cx: &mut Context<Self>) {
        let msg = self.commit_input.read(cx).content().to_string();
        self.state.commit_message = msg;
        self.state.commit_staged();
        if self.state.commit_message.is_empty() {
            self.commit_input.update(cx, |field, cx| field.clear(cx));
        }
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

    fn on_commit_input_event(
        &mut self,
        _input: Entity<CommitMessageField>,
        event: &CommitMessageEvent,
        cx: &mut Context<Self>,
    ) {
        match event {
            CommitMessageEvent::Changed(msg) => {
                self.state.commit_message = msg.clone();
                cx.notify();
            }
        }
    }

    fn on_palette_event(
        &mut self,
        _palette: Entity<CommandPalette>,
        event: &CommandPaletteEvent,
        cx: &mut Context<Self>,
    ) {
        match event {
            CommandPaletteEvent::Run(id) => match *id {
                "open_repo" => self.open_repo_dialog(cx),
                "refresh" => {
                    if self.state.guard_dirty() {
                        self.state.refresh_all();
                        self.sync_diff(cx);
                    }
                    cx.notify();
                }
                "save" => {
                    self.state.save_edit();
                    self.sync_diff(cx);
                    cx.notify();
                }
                "toggle_sxs" => {
                    self.state.side_by_side = !self.state.side_by_side;
                    self.sync_diff(cx);
                    cx.notify();
                }
                "commit" => self.commit_staged(cx),
                "fetch" => {
                    self.state.fetch_remote();
                    self.sync_diff(cx);
                    cx.notify();
                }
                "pull" => {
                    self.state.pull_remote();
                    self.sync_diff(cx);
                    cx.notify();
                }
                "push" => {
                    self.state.push_remote();
                    self.sync_diff(cx);
                    cx.notify();
                }
                "view_changes" => {
                    if self.state.guard_dirty() {
                        self.state.view_mode = ViewMode::Changes;
                    }
                    cx.notify();
                }
                "view_graph" => {
                    if self.state.guard_dirty() {
                        self.state.view_mode = ViewMode::Graph;
                    }
                    cx.notify();
                }
                "view_prs" => {
                    if self.state.guard_dirty() {
                        self.state.view_mode = ViewMode::PullRequests;
                        self.state.refresh_pull_requests();
                    }
                    cx.notify();
                }
                "quit" => cx.quit(),
                _ => {}
            },
            CommandPaletteEvent::Closed => cx.notify(),
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
            .relative()
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
            .on_action(cx.listener(Self::commit))
            .on_action(cx.listener(Self::quit))
            .on_action(cx.listener(Self::toggle_palette))
            .on_action(cx.listener(Self::fetch))
            .on_action(cx.listener(Self::pull))
            .on_action(cx.listener(Self::push))
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
            .child(self.palette.clone())
    }
}

fn toolbar(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let dirty = app.state.session.dirty;
    let theme_open = app.theme_menu_open;
    let settings_open = app.settings_menu_open;
    let current = app.state.prefs.theme_id;
    let sxs = app.state.side_by_side;
    let has_repo = app.state.repo.is_some();

    div()
        .flex()
        .flex_row()
        .h(px(42.))
        .w_full()
        .items_center()
        .gap_2()
        .pl(px(TITLEBAR_LEFT_INSET))
        .pr_3()
        .bg(rgb3(u.bg_surface))
        // Allow dragging the window from the empty titlebar strip.
        .window_control_area(WindowControlArea::Drag)
        .child(
            div()
                .flex_1()
                .text_xs()
                .text_color(rgb3(u.text_muted))
                .child(if dirty { "• Unsaved edits" } else { "" }),
        )
        .when(has_repo, |el| {
            el.child(toolbar_action_btn("Fetch", "fetch-btn", &u, cx, |this, _, _, cx| {
                this.state.fetch_remote();
                this.sync_diff(cx);
                cx.notify();
            }))
            .child(toolbar_action_btn("Pull", "pull-btn", &u, cx, |this, _, _, cx| {
                this.state.pull_remote();
                this.sync_diff(cx);
                cx.notify();
            }))
            .child(toolbar_action_btn("Push", "push-btn", &u, cx, |this, _, _, cx| {
                this.state.push_remote();
                this.sync_diff(cx);
                cx.notify();
            }))
        })
        .child(toolbar_action_btn("⌘P", "palette-btn", &u, cx, |this, _, window, cx| {
            this.toggle_palette(&ToggleCommandPalette, window, cx);
        }))
        .child(theme_dropdown_button(current, theme_open, &u, cx))
        .child(settings_cog_button(sxs, settings_open, &u, cx))
}

fn toolbar_action_btn(
    label: &'static str,
    id: &'static str,
    u: &conflicto_core::UiVars,
    cx: &mut Context<ConflictoApp>,
    on_click: impl Fn(&mut ConflictoApp, &ClickEvent, &mut Window, &mut Context<ConflictoApp>)
        + 'static,
) -> impl IntoElement {
    let u = u.clone();
    div()
        .id(id)
        .flex()
        .items_center()
        .h(px(28.))
        .px_2()
        .rounded_sm()
        .border_1()
        .border_color(rgb3(u.border))
        .bg(rgb3(u.bg))
        .cursor_pointer()
        .hover(|s| s.bg(rgb3(u.bg_hover)))
        .on_click(cx.listener(on_click))
        .child(
            div()
                .text_xs()
                .text_color(rgb3(u.text))
                .child(label),
        )
}

/// Overlay popover — absolute + deferred so it does not grow the toolbar.
fn theme_dropdown_button(
    current: conflicto_core::ThemeId,
    open: bool,
    u: &conflicto_core::UiVars,
    cx: &mut Context<ConflictoApp>,
) -> impl IntoElement {
    let u = u.clone();
    div()
        .relative()
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
                        .child(if open { "▴" } else { "▾" }),
                ),
        )
        .when(open, |el| {
            let u = u.clone();
            el.child(
                deferred(
                    div()
                        .id("theme-menu")
                        .absolute()
                        .top(px(32.))
                        .right_0()
                        .w(px(220.))
                        .rounded_sm()
                        .border_1()
                        .border_color(rgb3(u.border))
                        .bg(rgb3(u.bg_surface))
                        .shadow_md()
                        .py_1()
                        .occlude()
                        .children(themes().iter().map(|pack| {
                            let id = pack.id;
                            let selected = id == current;
                            div()
                                .id(SharedString::from(format!("theme-opt-{}", id.label())))
                                .flex()
                                .items_center()
                                .w_full()
                                .h(px(28.))
                                .px_3()
                                .cursor_pointer()
                                .when(selected, |el| el.bg(rgb3(u.bg_active)))
                                .hover(|s| s.bg(rgb3(u.bg_hover)))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.state.set_theme(id);
                                    this.theme_menu_open = false;
                                    let ui = this.state.ui_vars.clone();
                                    this.commit_input.update(cx, |field, _| field.set_ui(&ui));
                                    this.palette.update(cx, |p, _| p.set_ui(&ui));
                                    this.sync_diff(cx);
                                    cx.notify();
                                }))
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(rgb3(if selected {
                                            u.accent
                                        } else {
                                            u.text
                                        }))
                                        .child(id.label()),
                                )
                        })),
                )
                .with_priority(100),
            )
        })
}

fn settings_cog_button(
    sxs: bool,
    open: bool,
    u: &conflicto_core::UiVars,
    cx: &mut Context<ConflictoApp>,
) -> impl IntoElement {
    let u = u.clone();
    div()
        .relative()
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
                .bg(rgb3(if open { u.bg_active } else { u.bg }))
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
        )
        .when(open, |el| {
            let u = u.clone();
            el.child(
                deferred(
                    div()
                        .id("settings-menu")
                        .absolute()
                        .top(px(32.))
                        .right_0()
                        .w(px(220.))
                        .rounded_sm()
                        .border_1()
                        .border_color(rgb3(u.border))
                        .bg(rgb3(u.bg_surface))
                        .shadow_md()
                        .p_2()
                        .occlude()
                        .child(
                            div()
                                .id("sxs-toggle")
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap_2()
                                .w_full()
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
                                                .text_color(rgb3(if sxs {
                                                    u.btn_fg
                                                } else {
                                                    u.bg
                                                }))
                                                .child(if sxs { "✓" } else { " " }),
                                        ),
                                )
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(rgb3(u.text))
                                        .child("Side by side"),
                                ),
                        ),
                )
                .with_priority(100),
            )
        })
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
                    ViewMode::PullRequests => pr_list(app, cx).into_any_element(),
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
            let branch_open = app.branch_menu_open;
            el.child(
                div()
                    .relative()
                    .px_3()
                    .pb_1()
                    .child(
                        div()
                            .id("branch-switcher")
                            .flex()
                            .flex_row()
                            .items_center()
                            .gap_1()
                            .px_2()
                            .py_1()
                            .rounded_sm()
                            .border_1()
                            .border_color(rgb3(u.border))
                            .bg(rgb3(u.bg))
                            .cursor_pointer()
                            .hover(|s| s.bg(rgb3(u.bg_hover)))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.branch_menu_open = !this.branch_menu_open;
                                this.repo_menu_open = false;
                                this.theme_menu_open = false;
                                this.settings_menu_open = false;
                                cx.notify();
                            }))
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(rgb3(u.text_muted))
                                    .child(format!("⎇ {branch}")),
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(rgb3(u.text_muted))
                                    .child(if branch_open { "▴" } else { "▾" }),
                            ),
                    )
                    .when(branch_open, |el| el.child(branch_menu(app, cx))),
            )
        })
        .when(menu_open, |el| el.child(repo_menu(app, cx)))
}

fn branch_menu(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let branches = app.state.branches.clone();
    deferred(
        div()
            .id("branch-menu")
            .absolute()
            .top(px(28.))
            .left_0()
            .right_0()
            .max_h(px(240.))
            .overflow_scroll()
            .rounded_sm()
            .border_1()
            .border_color(rgb3(u.border))
            .bg(rgb3(u.bg_surface))
            .shadow_md()
            .py_1()
            .occlude()
            .children(branches.into_iter().map(|b| {
                let name = b.name.clone();
                let current = b.current;
                let remote = b.remote;
                let u = u.clone();
                div()
                    .id(SharedString::from(format!("branch-{name}")))
                    .flex()
                    .flex_row()
                    .items_center()
                    .h(px(26.))
                    .px_2()
                    .when(current, |el| el.bg(rgb3(u.bg_active)))
                    .cursor_pointer()
                    .hover(|s| s.bg(rgb3(u.bg_hover)))
                    .on_click(cx.listener({
                        let name = name.clone();
                        move |this, _, _, cx| {
                            if !current {
                                this.state.switch_branch(&name);
                                this.sync_diff(cx);
                            }
                            this.branch_menu_open = false;
                            cx.notify();
                        }
                    }))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .text_xs()
                            .text_color(rgb3(if current { u.accent } else { u.text }))
                            .overflow_hidden()
                            .text_ellipsis()
                            .child(if remote {
                                format!("☁ {name}")
                            } else {
                                name
                            }),
                    )
            })),
    )
    .with_priority(100)
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
    let show_prs = app.state.github.is_some();
    div()
        .flex()
        .flex_row()
        .gap_1()
        .px_2()
        .py_1()
        .child(tab_btn("Changes", mode == ViewMode::Changes, u.clone(), cx, ViewMode::Changes))
        .child(tab_btn("Graph", mode == ViewMode::Graph, u.clone(), cx, ViewMode::Graph))
        .when(show_prs, |el| {
            el.child(tab_btn(
                "PRs",
                mode == ViewMode::PullRequests,
                u,
                cx,
                ViewMode::PullRequests,
            ))
        })
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
            if mode == ViewMode::PullRequests {
                this.state.refresh_pull_requests();
            }
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
    let has_staged = !staged.is_empty();
    let has_unstaged = !unstaged.is_empty();
    let can_commit = has_staged && !app.state.commit_message.trim().is_empty();
    div()
        .id("changes")
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .overflow_scroll()
        .p_2()
        .gap_2()
        .child(commit_box(app, can_commit, &u, cx))
        .child(section_header(
            "Staged",
            has_staged.then_some(("Discard all", "discard-all-staged")),
            &u,
            cx,
            |this, _, _, cx| {
                this.state.unstage_all_staged();
                this.sync_diff(cx);
                cx.notify();
            },
        ))
        .children(
            staged
                .into_iter()
                .map(|e| change_row(e, &u, &app.state.session, true, cx)),
        )
        .child(section_header(
            "Changes",
            has_unstaged.then_some(("Add all", "add-all-changes")),
            &u,
            cx,
            |this, _, _, cx| {
                this.state.stage_all_unstaged();
                this.sync_diff(cx);
                cx.notify();
            },
        ))
        .children(
            unstaged
                .into_iter()
                .map(|e| change_row(e, &u, &app.state.session, false, cx)),
        )
}

fn commit_box(
    app: &mut ConflictoApp,
    can_commit: bool,
    u: &conflicto_core::UiVars,
    cx: &mut Context<ConflictoApp>,
) -> impl IntoElement {
    let u = u.clone();
    div()
        .flex()
        .flex_col()
        .gap_2()
        .pb_2()
        .child(app.commit_input.clone())
        .child(
            div()
                .id("commit-btn")
                .flex()
                .items_center()
                .justify_center()
                .h(px(28.))
                .px_2()
                .rounded_sm()
                .border_1()
                .border_color(rgb3(if can_commit { u.accent } else { u.border }))
                .bg(rgb3(if can_commit { u.btn_bg } else { u.bg_surface }))
                .when(can_commit, |el| {
                    el.cursor_pointer()
                        .hover(|s| {
                            s.bg(rgb3(u.bg_hover))
                                .border_color(rgb3(u.accent))
                                .text_color(rgb3(u.accent))
                        })
                        .active(|s| s.bg(rgb3(u.bg_active)).opacity(0.85))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.commit_staged(cx);
                        }))
                })
                .when(!can_commit, |el| el.opacity(0.55))
                .child(
                    div()
                        .text_xs()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(rgb3(if can_commit { u.accent } else { u.text_muted }))
                        .child("Commit"),
                ),
        )
}

fn section_header(
    title: &'static str,
    action: Option<(&'static str, &'static str)>,
    u: &conflicto_core::UiVars,
    cx: &mut Context<ConflictoApp>,
    on_action: impl Fn(&mut ConflictoApp, &ClickEvent, &mut Window, &mut Context<ConflictoApp>)
        + 'static,
) -> impl IntoElement {
    let u = u.clone();
    div()
        .flex()
        .flex_row()
        .items_center()
        .gap_2()
        .child(
            div()
                .flex_1()
                .text_xs()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(rgb3(u.text_muted))
                .child(title),
        )
        .children(action.map(|(label, id)| {
            div()
                .id(id)
                .px_1()
                .rounded_sm()
                .border_1()
                .border_color(rgb3(u.border))
                .bg(rgb3(u.bg_surface))
                .cursor_pointer()
                .hover(|s| {
                    s.bg(rgb3(u.btn_bg))
                        .border_color(rgb3(u.accent))
                        .text_color(rgb3(u.accent))
                })
                .active(|s| s.bg(rgb3(u.bg_active)).opacity(0.85))
                .on_click(cx.listener(on_action))
                .child(
                    div()
                        .text_xs()
                        .text_color(rgb3(u.text_muted))
                        .child(label),
                )
        }))
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
            let glyph = graph_row_glyph(&row);
            let refs = row.commit.refs.iter().take(2).cloned().collect::<Vec<_>>();
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
                                .font_family("Menlo")
                                .text_color(rgb3(u.accent))
                                .child(glyph),
                        )
                        .child(
                            div()
                                .text_xs()
                                .font_family("Menlo")
                                .text_color(rgb3(u.text_muted))
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
                        )
                        .children(refs.into_iter().map(|r| {
                            let u = u.clone();
                            div()
                                .px_1()
                                .rounded_sm()
                                .bg(rgb3(u.bg))
                                .text_xs()
                                .text_color(rgb3(u.accent))
                                .child(r)
                        })),
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

fn pr_list(app: &mut ConflictoApp, cx: &mut Context<ConflictoApp>) -> impl IntoElement {
    let u = app.state.ui_vars.clone();
    let prs = app.state.pull_requests.clone();
    let selected = app.state.selected_pr;
    let github = app.state.github.clone();

    div()
        .id("pull-requests")
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .overflow_scroll()
        .p_2()
        .gap_1()
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .px_1()
                .pb_1()
                .child(
                    div()
                        .text_xs()
                        .text_color(rgb3(u.text_muted))
                        .child(match &github {
                            Some(g) => format!("{}/{}", g.owner, g.repo),
                            None => "No GitHub remote".into(),
                        }),
                )
                .child(
                    div()
                        .id("refresh-prs")
                        .px_2()
                        .py_1()
                        .rounded_sm()
                        .border_1()
                        .border_color(rgb3(u.border))
                        .bg(rgb3(u.bg))
                        .cursor_pointer()
                        .hover(|s| s.bg(rgb3(u.bg_hover)))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.refresh_pull_requests();
                            cx.notify();
                        }))
                        .child(
                            div()
                                .text_xs()
                                .text_color(rgb3(u.text))
                                .child("Refresh"),
                        ),
                ),
        )
        .when(prs.is_empty(), |el| {
            el.child(
                div()
                    .px_2()
                    .py_3()
                    .text_xs()
                    .text_color(rgb3(u.text_muted))
                    .child("No open pull requests (requires `gh` auth)."),
            )
        })
        .children(prs.into_iter().map(|pr| {
            let number = pr.number;
            let title = pr.title.clone();
            let meta = format!(
                "#{} {} → {} · {}",
                pr.number, pr.head_ref, pr.base_ref, pr.author
            );
            let draft = pr.is_draft;
            let is_sel = selected == Some(number);
            let u = u.clone();
            div()
                .id(SharedString::from(format!("pr-{number}")))
                .flex()
                .flex_col()
                .gap_1()
                .px_2()
                .py_2()
                .rounded_sm()
                .when(is_sel, |el| el.bg(rgb3(u.bg_active)))
                .cursor_pointer()
                .hover(|s| s.bg(rgb3(u.bg_hover)))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.open_pull_request(number);
                    this.sync_diff(cx);
                    cx.notify();
                }))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap_1()
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .text_sm()
                                .overflow_hidden()
                                .text_ellipsis()
                                .child(title),
                        )
                        .when(draft, |el| {
                            el.child(
                                div()
                                    .text_xs()
                                    .text_color(rgb3(u.text_muted))
                                    .child("draft"),
                            )
                        }),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(rgb3(u.text_muted))
                        .child(meta),
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
        KeyBinding::new("cmd-enter", Commit, None),
        KeyBinding::new("ctrl-enter", Commit, None),
        KeyBinding::new("cmd-q", Quit, None),
        KeyBinding::new("alt-f4", Quit, None),
        KeyBinding::new("cmd-p", ToggleCommandPalette, None),
        KeyBinding::new("ctrl-p", ToggleCommandPalette, None),
        KeyBinding::new("cmd-shift-f", Fetch, None),
        KeyBinding::new("ctrl-shift-f", Fetch, None),
        KeyBinding::new("cmd-shift-l", Pull, None),
        KeyBinding::new("ctrl-shift-l", Pull, None),
        KeyBinding::new("cmd-shift-p", Push, None),
        KeyBinding::new("ctrl-shift-p", Push, None),
    ]);
}
