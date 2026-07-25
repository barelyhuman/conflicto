use conflicto_core::highlight_source;

#[test]
fn rust_snippet_produces_spans() {
    let src = "fn main() { let x = 1; }\n";
    let spans = highlight_source("main.rs", src);
    assert!(!spans.is_empty(), "expected highlight spans for rust");
}
