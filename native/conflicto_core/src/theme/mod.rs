mod derive;
mod packs;

pub use packs::{get_theme, themes, ThemePack, DEFAULT_THEME_ID};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeId {
    PierreDark,
    PierreLight,
    DarkPlus,
    LightPlus,
    RosePine,
    RosePineMoon,
    RosePineDawn,
}

impl ThemeId {
    pub fn label(self) -> &'static str {
        match self {
            Self::PierreDark => "Pierre Dark",
            Self::PierreLight => "Pierre Light",
            Self::DarkPlus => "Dark+",
            Self::LightPlus => "Light+",
            Self::RosePine => "Rosé Pine",
            Self::RosePineMoon => "Rosé Pine Moon",
            Self::RosePineDawn => "Rosé Pine Dawn",
        }
    }

    pub fn all() -> &'static [ThemeId] {
        &[
            Self::PierreDark,
            Self::PierreLight,
            Self::DarkPlus,
            Self::LightPlus,
            Self::RosePine,
            Self::RosePineMoon,
            Self::RosePineDawn,
        ]
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorScheme {
    Light,
    Dark,
}

#[derive(Debug, Clone)]
pub struct UiVars {
    pub bg: [u8; 3],
    pub bg_sidebar: [u8; 3],
    pub bg_surface: [u8; 3],
    pub bg_hover: [u8; 3],
    pub bg_active: [u8; 3],
    pub border: [u8; 3],
    pub text: [u8; 3],
    pub text_muted: [u8; 3],
    pub accent: [u8; 3],
    pub accent_hover: [u8; 3],
    pub btn_bg: [u8; 3],
    pub btn_hover: [u8; 3],
    pub btn_fg: [u8; 3],
    pub status_m: [u8; 3],
    pub status_a: [u8; 3],
    pub status_d: [u8; 3],
    pub status_r: [u8; 3],
    pub danger_bg: [u8; 3],
    pub danger_border: [u8; 3],
    pub danger_fg: [u8; 3],
    pub ref_fg: [u8; 3],
    pub ref_bg: [u8; 3],
}
