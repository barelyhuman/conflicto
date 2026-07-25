//! Language Server Protocol scaffolding.
//!
//! Full LSP (diagnostics, completion, hover, goto) is not wired into the editor yet.
//! This module defines the document model and a no-op client so the UI/core can
//! grow toward LSP without inventing parallel types later.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Language id inferred from a file path (subset of VS Code language ids).
pub fn language_id_for_path(path: &str) -> Option<&'static str> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "rs" => Some("rust"),
        "ts" => Some("typescript"),
        "tsx" => Some("typescriptreact"),
        "js" | "mjs" | "cjs" => Some("javascript"),
        "jsx" => Some("javascriptreact"),
        "py" => Some("python"),
        "json" => Some("json"),
        "css" => Some("css"),
        "md" => Some("markdown"),
        "toml" => Some("toml"),
        _ => None,
    }
}

/// Suggested language-server command for a language id (best-effort, may be absent).
pub fn suggested_server_command(language_id: &str) -> Option<&'static [&'static str]> {
    match language_id {
        "rust" => Some(&["rust-analyzer"]),
        "typescript" | "typescriptreact" | "javascript" | "javascriptreact" => {
            Some(&["typescript-language-server", "--stdio"])
        }
        "python" => Some(&["pyright-langserver", "--stdio"]),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
}

#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub line: u32,
    pub character: u32,
    pub end_line: u32,
    pub end_character: u32,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TextDocument {
    pub path: PathBuf,
    pub language_id: String,
    pub version: i32,
    pub text: String,
}

/// Placeholder LSP session: tracks open documents; no process I/O yet.
#[derive(Debug, Default)]
pub struct LspSession {
    documents: HashMap<PathBuf, TextDocument>,
    diagnostics: HashMap<PathBuf, Vec<Diagnostic>>,
}

impl LspSession {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&mut self, path: impl Into<PathBuf>, text: impl Into<String>) {
        let path = path.into();
        let language_id = language_id_for_path(&path.to_string_lossy())
            .unwrap_or("plaintext")
            .to_string();
        self.documents.insert(
            path.clone(),
            TextDocument {
                path,
                language_id,
                version: 1,
                text: text.into(),
            },
        );
    }

    pub fn update(&mut self, path: &Path, text: impl Into<String>) {
        if let Some(doc) = self.documents.get_mut(path) {
            doc.version += 1;
            doc.text = text.into();
        }
    }

    pub fn close(&mut self, path: &Path) {
        self.documents.remove(path);
        self.diagnostics.remove(path);
    }

    pub fn diagnostics(&self, path: &Path) -> &[Diagnostic] {
        self.diagnostics
            .get(path)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    pub fn set_diagnostics(&mut self, path: PathBuf, diags: Vec<Diagnostic>) {
        self.diagnostics.insert(path, diags);
    }

    pub fn document(&self, path: &Path) -> Option<&TextDocument> {
        self.documents.get(path)
    }

    pub fn open_count(&self) -> usize {
        self.documents.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_id_rust() {
        assert_eq!(language_id_for_path("src/main.rs"), Some("rust"));
        assert_eq!(language_id_for_path("a.tsx"), Some("typescriptreact"));
        assert_eq!(language_id_for_path("x.bin"), None);
    }

    #[test]
    fn session_open_update() {
        let mut s = LspSession::new();
        s.open("foo.rs", "fn main() {}");
        assert_eq!(s.open_count(), 1);
        s.update(Path::new("foo.rs"), "fn main() { let x = 1; }");
        assert_eq!(s.document(Path::new("foo.rs")).unwrap().version, 2);
    }
}
