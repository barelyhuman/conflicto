//! Syntax highlighting via tree-sitter.
//!
//! Built-in grammars are registered at startup. A future language-extension
//! loader can call [`LanguageRegistry::register`] without changing callers.

mod builtin;
mod theme;

pub use theme::{highlight_color, HighlightPalette};

use std::collections::HashMap;
use std::ops::Range;
use std::sync::{Mutex, OnceLock};

use tree_sitter_highlight::{Highlight, HighlightConfiguration, HighlightEvent, Highlighter};

/// Capture names recognized by Conflicto (must match highlight queries).
pub const HIGHLIGHT_NAMES: &[&str] = &[
    "attribute",
    "comment",
    "constant",
    "constant.builtin",
    "constructor",
    "embedded",
    "function",
    "function.builtin",
    "keyword",
    "module",
    "number",
    "operator",
    "property",
    "property.builtin",
    "punctuation",
    "punctuation.bracket",
    "punctuation.delimiter",
    "punctuation.special",
    "string",
    "string.special",
    "tag",
    "type",
    "type.builtin",
    "variable",
    "variable.builtin",
    "variable.parameter",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HighlightKind {
    Attribute,
    Comment,
    Constant,
    ConstantBuiltin,
    Constructor,
    Embedded,
    Function,
    FunctionBuiltin,
    Keyword,
    Module,
    Number,
    Operator,
    Property,
    PropertyBuiltin,
    Punctuation,
    PunctuationBracket,
    PunctuationDelimiter,
    PunctuationSpecial,
    String,
    StringSpecial,
    Tag,
    Type,
    TypeBuiltin,
    Variable,
    VariableBuiltin,
    VariableParameter,
}

impl HighlightKind {
    pub fn from_index(idx: usize) -> Option<Self> {
        use HighlightKind::*;
        Some(match idx {
            0 => Attribute,
            1 => Comment,
            2 => Constant,
            3 => ConstantBuiltin,
            4 => Constructor,
            5 => Embedded,
            6 => Function,
            7 => FunctionBuiltin,
            8 => Keyword,
            9 => Module,
            10 => Number,
            11 => Operator,
            12 => Property,
            13 => PropertyBuiltin,
            14 => Punctuation,
            15 => PunctuationBracket,
            16 => PunctuationDelimiter,
            17 => PunctuationSpecial,
            18 => String,
            19 => StringSpecial,
            20 => Tag,
            21 => Type,
            22 => TypeBuiltin,
            23 => Variable,
            24 => VariableBuiltin,
            25 => VariableParameter,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone)]
pub struct HighlightSpan {
    pub range: Range<usize>,
    pub kind: HighlightKind,
}

/// Pluggable registry of highlight configurations.
pub struct LanguageRegistry {
    by_id: HashMap<String, HighlightConfiguration>,
    ext_to_id: HashMap<String, String>,
}

impl LanguageRegistry {
    pub fn new() -> Self {
        Self {
            by_id: HashMap::new(),
            ext_to_id: HashMap::new(),
        }
    }

    /// Register a language for later lookup. Safe for a future extension loader.
    pub fn register(
        &mut self,
        id: impl Into<String>,
        mut config: HighlightConfiguration,
        extensions: &[&str],
    ) {
        config.configure(HIGHLIGHT_NAMES);
        let id = id.into();
        for ext in extensions {
            self.ext_to_id
                .insert(ext.trim_start_matches('.').to_ascii_lowercase(), id.clone());
        }
        self.by_id.insert(id, config);
    }

    pub fn resolve_id(&self, language_or_ext: &str) -> Option<&str> {
        let key = language_or_ext.trim_start_matches('.').to_ascii_lowercase();
        if self.by_id.contains_key(&key) {
            return Some(self.by_id.get_key_value(&key)?.0.as_str());
        }
        self.ext_to_id.get(&key).map(|s| s.as_str())
    }

    pub fn config_for_path(&self, path: &str) -> Option<&HighlightConfiguration> {
        let ext = std::path::Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let id = self.resolve_id(ext)?;
        self.by_id.get(id)
    }

    pub fn config_for_language(&self, language: &str) -> Option<&HighlightConfiguration> {
        let id = self.resolve_id(language)?;
        self.by_id.get(id)
    }
}

impl Default for LanguageRegistry {
    fn default() -> Self {
        let mut reg = Self::new();
        builtin::register_builtins(&mut reg);
        reg
    }
}

fn global_registry() -> &'static LanguageRegistry {
    static REG: OnceLock<LanguageRegistry> = OnceLock::new();
    REG.get_or_init(LanguageRegistry::default)
}

fn process_highlighter() -> &'static Mutex<Highlighter> {
    static HL: OnceLock<Mutex<Highlighter>> = OnceLock::new();
    HL.get_or_init(|| Mutex::new(Highlighter::new()))
}

/// Highlight `source` for a file path (extension → language).
pub fn highlight_source(path: &str, source: &str) -> Vec<HighlightSpan> {
    let Some(config) = global_registry().config_for_path(path) else {
        return Vec::new();
    };
    highlight_with_config(config, source)
}

/// Highlight using an explicit language id (`rust`, `typescript`, …).
pub fn highlight_language(language: &str, source: &str) -> Vec<HighlightSpan> {
    let Some(config) = global_registry().config_for_language(language) else {
        return Vec::new();
    };
    highlight_with_config(config, source)
}

fn highlight_with_config(config: &HighlightConfiguration, source: &str) -> Vec<HighlightSpan> {
    let mut hl = process_highlighter()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let Ok(events) = hl.highlight(config, source.as_bytes(), None, |_| None) else {
        return Vec::new();
    };

    let mut spans = Vec::new();
    let mut stack: Vec<Highlight> = Vec::new();
    for event in events.flatten() {
        match event {
            HighlightEvent::HighlightStart(h) => stack.push(h),
            HighlightEvent::HighlightEnd => {
                stack.pop();
            }
            HighlightEvent::Source { start, end } => {
                if let Some(h) = stack.last() {
                    if let Some(kind) = HighlightKind::from_index(h.0) {
                        spans.push(HighlightSpan {
                            range: start..end,
                            kind,
                        });
                    }
                }
            }
        }
    }
    spans
}

/// Access the global registry (for tests / future extension loading).
pub fn registry() -> &'static LanguageRegistry {
    global_registry()
}
