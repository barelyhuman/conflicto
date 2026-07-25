use crate::theme::color::{darken, lighten};
use crate::theme::{ColorScheme, UiVars};

use super::HighlightKind;

/// RGB colors for syntax captures.
#[derive(Debug, Clone)]
pub struct HighlightPalette {
    pub comment: [u8; 3],
    pub keyword: [u8; 3],
    pub string: [u8; 3],
    pub number: [u8; 3],
    pub function: [u8; 3],
    pub type_name: [u8; 3],
    pub constant: [u8; 3],
    pub property: [u8; 3],
    pub operator: [u8; 3],
    pub punctuation: [u8; 3],
    pub variable: [u8; 3],
    pub tag: [u8; 3],
    pub attribute: [u8; 3],
    pub embedded: [u8; 3],
}

impl HighlightPalette {
    pub fn from_ui(ui: &UiVars, scheme: ColorScheme) -> Self {
        let is_light = matches!(scheme, ColorScheme::Light);
        if is_light {
            Self {
                comment: ui.text_muted,
                keyword: ui.accent,
                string: darken(ui.status_a, 0.15),
                number: darken(ui.status_m, 0.1),
                function: darken(ui.ref_fg, 0.05),
                type_name: darken(ui.accent, 0.2),
                constant: darken(ui.status_m, 0.05),
                property: ui.text,
                operator: ui.text_muted,
                punctuation: ui.text_muted,
                variable: ui.text,
                tag: ui.accent,
                attribute: darken(ui.status_a, 0.25),
                embedded: ui.text,
            }
        } else {
            Self {
                comment: ui.text_muted,
                keyword: ui.accent_hover,
                string: ui.status_a,
                number: ui.status_m,
                function: ui.ref_fg,
                type_name: lighten(ui.accent, 0.15),
                constant: ui.status_m,
                property: lighten(ui.text, 0.05),
                operator: ui.text_muted,
                punctuation: ui.text_muted,
                variable: ui.text,
                tag: ui.accent_hover,
                attribute: ui.status_a,
                embedded: ui.text,
            }
        }
    }
}

pub fn highlight_color(kind: HighlightKind, palette: &HighlightPalette) -> [u8; 3] {
    use HighlightKind::*;
    match kind {
        Comment => palette.comment,
        Keyword | Module => palette.keyword,
        String | StringSpecial => palette.string,
        Number => palette.number,
        Function | FunctionBuiltin | Constructor => palette.function,
        Type | TypeBuiltin => palette.type_name,
        Constant | ConstantBuiltin => palette.constant,
        Property | PropertyBuiltin => palette.property,
        Operator => palette.operator,
        Punctuation | PunctuationBracket | PunctuationDelimiter | PunctuationSpecial => {
            palette.punctuation
        }
        Variable | VariableBuiltin | VariableParameter => palette.variable,
        Tag => palette.tag,
        Attribute => palette.attribute,
        Embedded => palette.embedded,
    }
}
