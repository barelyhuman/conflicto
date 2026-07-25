use super::derive::derive_ui_vars;
use super::{ColorScheme, ThemeId, UiVars};

pub struct ThemePack {
    pub id: ThemeId,
    pub label: &'static str,
    pub scheme: ColorScheme,
    pub ui: UiVars,
}

pub const DEFAULT_THEME_ID: ThemeId = ThemeId::PierreDark;

fn pack(id: ThemeId, label: &'static str, scheme: ColorScheme, colors: &[(&str, &str)]) -> ThemePack {
    ThemePack {
        id,
        label,
        scheme,
        ui: derive_ui_vars(colors, scheme),
    }
}

fn rose(id: ThemeId, label: &'static str, scheme: ColorScheme, c: Rose) -> ThemePack {
    let colors: [(&str, &str); 18] = [
        ("editor.background", c.base),
        ("editor.foreground", c.text),
        ("editorLineNumber.foreground", c.muted),
        ("editorWidget.background", c.surface),
        ("editorWidget.border", c.highlight_high),
        ("sideBar.background", c.surface),
        ("panel.border", c.highlight_high),
        ("focusBorder", c.iris),
        ("button.background", c.iris),
        ("button.secondaryBackground", c.overlay),
        ("input.background", c.overlay),
        ("list.hoverBackground", c.highlight_low),
        ("list.activeSelectionBackground", c.highlight_med),
        ("textLink.foreground", c.foam),
        ("gitDecoration.modifiedResourceForeground", c.gold),
        ("gitDecoration.addedResourceForeground", c.foam),
        ("gitDecoration.deletedResourceForeground", c.love),
        ("gitDecoration.renamedResourceForeground", c.pine),
    ];
    // error colors — append via second derive by including in a vec
    let mut all = Vec::from(colors);
    all.push(("errorForeground", c.love));
    all.push(("inputValidation.errorBorder", c.love));
    pack(id, label, scheme, &all)
}

struct Rose {
    base: &'static str,
    surface: &'static str,
    overlay: &'static str,
    muted: &'static str,
    text: &'static str,
    iris: &'static str,
    foam: &'static str,
    gold: &'static str,
    love: &'static str,
    pine: &'static str,
    highlight_low: &'static str,
    highlight_med: &'static str,
    highlight_high: &'static str,
}

pub fn themes() -> Vec<ThemePack> {
    vec![
        pack(
            ThemeId::PierreDark,
            "Pierre Dark",
            ColorScheme::Dark,
            &[
                ("editor.background", "#1a1a1a"),
                ("editor.foreground", "#e4e4e7"),
                ("editorLineNumber.foreground", "#71717a"),
                ("editorWidget.background", "#222225"),
                ("editorWidget.border", "#3f3f46"),
                ("sideBar.background", "#141416"),
                ("panel.border", "#27272a"),
                ("focusBorder", "#a78bfa"),
                ("button.background", "#7c3aed"),
                ("button.secondaryBackground", "#3f3f46"),
                ("input.background", "#27272a"),
                ("list.hoverBackground", "#27272a"),
                ("list.activeSelectionBackground", "#3b2f5a"),
                ("textLink.foreground", "#c4b5fd"),
                ("gitDecoration.modifiedResourceForeground", "#fbbf24"),
                ("gitDecoration.addedResourceForeground", "#4ade80"),
                ("gitDecoration.deletedResourceForeground", "#f87171"),
                ("gitDecoration.renamedResourceForeground", "#4ade80"),
                ("errorForeground", "#f87171"),
                ("inputValidation.errorBorder", "#f87171"),
            ],
        ),
        pack(
            ThemeId::PierreLight,
            "Pierre Light",
            ColorScheme::Light,
            &[
                ("editor.background", "#fafafa"),
                ("editor.foreground", "#18181b"),
                ("editorLineNumber.foreground", "#71717a"),
                ("editorWidget.background", "#f4f4f5"),
                ("editorWidget.border", "#d4d4d8"),
                ("sideBar.background", "#f4f4f5"),
                ("panel.border", "#e4e4e7"),
                ("focusBorder", "#7c3aed"),
                ("button.background", "#7c3aed"),
                ("button.secondaryBackground", "#e4e4e7"),
                ("input.background", "#ffffff"),
                ("list.hoverBackground", "#ececef"),
                ("list.activeSelectionBackground", "#ede9fe"),
                ("textLink.foreground", "#6d28d9"),
                ("gitDecoration.modifiedResourceForeground", "#a16207"),
                ("gitDecoration.addedResourceForeground", "#15803d"),
                ("gitDecoration.deletedResourceForeground", "#b91c1c"),
                ("gitDecoration.renamedResourceForeground", "#15803d"),
                ("errorForeground", "#b91c1c"),
                ("inputValidation.errorBorder", "#dc2626"),
            ],
        ),
        pack(
            ThemeId::DarkPlus,
            "Dark+",
            ColorScheme::Dark,
            &[
                ("editor.background", "#1e1e1e"),
                ("editor.foreground", "#d4d4d4"),
                ("editorLineNumber.foreground", "#858585"),
                ("editorWidget.background", "#252526"),
                ("editorWidget.border", "#454545"),
                ("sideBar.background", "#252526"),
                ("panel.border", "#2b2b2b"),
                ("focusBorder", "#007fd4"),
                ("button.background", "#0e639c"),
                ("button.secondaryBackground", "#3c3c3c"),
                ("input.background", "#3c3c3c"),
                ("list.hoverBackground", "#2a2d2e"),
                ("list.activeSelectionBackground", "#094771"),
                ("textLink.foreground", "#3794ff"),
                ("gitDecoration.modifiedResourceForeground", "#e2c08d"),
                ("gitDecoration.addedResourceForeground", "#73c991"),
                ("gitDecoration.deletedResourceForeground", "#f14c4c"),
                ("gitDecoration.renamedResourceForeground", "#73c991"),
                ("errorForeground", "#f48771"),
                ("inputValidation.errorBorder", "#f14c4c"),
            ],
        ),
        pack(
            ThemeId::LightPlus,
            "Light+",
            ColorScheme::Light,
            &[
                ("editor.background", "#ffffff"),
                ("editor.foreground", "#000000"),
                ("editorLineNumber.foreground", "#237893"),
                ("editorWidget.background", "#f3f3f3"),
                ("editorWidget.border", "#c8c8c8"),
                ("sideBar.background", "#f3f3f3"),
                ("panel.border", "#e7e7e7"),
                ("focusBorder", "#0090f1"),
                ("button.background", "#0078d4"),
                ("button.secondaryBackground", "#eeeeee"),
                ("input.background", "#ffffff"),
                ("list.hoverBackground", "#e8e8e8"),
                ("list.activeSelectionBackground", "#add6ff"),
                ("textLink.foreground", "#006ab1"),
                ("gitDecoration.modifiedResourceForeground", "#895503"),
                ("gitDecoration.addedResourceForeground", "#3a7a10"),
                ("gitDecoration.deletedResourceForeground", "#ad0707"),
                ("gitDecoration.renamedResourceForeground", "#3a7a10"),
                ("errorForeground", "#a1260d"),
                ("inputValidation.errorBorder", "#e51400"),
            ],
        ),
        rose(
            ThemeId::RosePine,
            "Rosé Pine",
            ColorScheme::Dark,
            Rose {
                base: "#191724",
                surface: "#1f1d2e",
                overlay: "#26233a",
                muted: "#6e6a86",
                text: "#e0def4",
                iris: "#c4a7e7",
                foam: "#9ccfd8",
                gold: "#f6c177",
                love: "#eb6f92",
                pine: "#31748f",
                highlight_low: "#21202e",
                highlight_med: "#403d52",
                highlight_high: "#524f67",
            },
        ),
        rose(
            ThemeId::RosePineMoon,
            "Rosé Pine Moon",
            ColorScheme::Dark,
            Rose {
                base: "#232136",
                surface: "#2a273f",
                overlay: "#393552",
                muted: "#6e6a86",
                text: "#e0def4",
                iris: "#c4a7e7",
                foam: "#9ccfd8",
                gold: "#f6c177",
                love: "#eb6f92",
                pine: "#3e8fb0",
                highlight_low: "#2a283e",
                highlight_med: "#44415a",
                highlight_high: "#56526e",
            },
        ),
        rose(
            ThemeId::RosePineDawn,
            "Rosé Pine Dawn",
            ColorScheme::Light,
            Rose {
                base: "#faf4ed",
                surface: "#fffaf3",
                overlay: "#f2e9e1",
                muted: "#9893a5",
                text: "#575279",
                iris: "#907aa9",
                foam: "#56949f",
                gold: "#ea9d34",
                love: "#b4637a",
                pine: "#286983",
                highlight_low: "#f4ede8",
                highlight_med: "#dfdad9",
                highlight_high: "#cecacd",
            },
        ),
    ]
}

pub fn get_theme(id: ThemeId) -> ThemePack {
    themes()
        .into_iter()
        .find(|t| t.id == id)
        .unwrap_or_else(|| themes().into_iter().next().unwrap())
}
