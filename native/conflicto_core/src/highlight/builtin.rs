use tree_sitter_highlight::HighlightConfiguration;

use super::LanguageRegistry;

fn configure(
    language: tree_sitter::Language,
    name: &str,
    highlights: &str,
    injections: &str,
    locals: &str,
) -> Option<HighlightConfiguration> {
    HighlightConfiguration::new(language, name, highlights, injections, locals).ok()
}

pub fn register_builtins(reg: &mut LanguageRegistry) {
    // Rust
    if let Some(cfg) = configure(
        tree_sitter_rust::LANGUAGE.into(),
        "rust",
        tree_sitter_rust::HIGHLIGHTS_QUERY,
        tree_sitter_rust::INJECTIONS_QUERY,
        "",
    ) {
        reg.register("rust", cfg, &["rs"]);
    }

    // JavaScript
    if let Some(cfg) = configure(
        tree_sitter_javascript::LANGUAGE.into(),
        "javascript",
        tree_sitter_javascript::HIGHLIGHT_QUERY,
        tree_sitter_javascript::INJECTIONS_QUERY,
        tree_sitter_javascript::LOCALS_QUERY,
    ) {
        reg.register("javascript", cfg, &["js", "jsx", "mjs", "cjs"]);
    }

    // TypeScript / TSX
    if let Some(cfg) = configure(
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        "typescript",
        tree_sitter_typescript::HIGHLIGHTS_QUERY,
        "",
        tree_sitter_typescript::LOCALS_QUERY,
    ) {
        reg.register("typescript", cfg, &["ts", "mts", "cts"]);
    }
    if let Some(cfg) = configure(
        tree_sitter_typescript::LANGUAGE_TSX.into(),
        "tsx",
        tree_sitter_typescript::HIGHLIGHTS_QUERY,
        "",
        tree_sitter_typescript::LOCALS_QUERY,
    ) {
        reg.register("tsx", cfg, &["tsx"]);
    }

    // Python
    if let Some(cfg) = configure(
        tree_sitter_python::LANGUAGE.into(),
        "python",
        tree_sitter_python::HIGHLIGHTS_QUERY,
        "",
        "",
    ) {
        reg.register("python", cfg, &["py"]);
    }

    // JSON
    if let Some(cfg) = configure(
        tree_sitter_json::LANGUAGE.into(),
        "json",
        tree_sitter_json::HIGHLIGHTS_QUERY,
        "",
        "",
    ) {
        reg.register("json", cfg, &["json"]);
    }

    // CSS
    if let Some(cfg) = configure(
        tree_sitter_css::LANGUAGE.into(),
        "css",
        tree_sitter_css::HIGHLIGHTS_QUERY,
        "",
        "",
    ) {
        reg.register("css", cfg, &["css"]);
    }
}
