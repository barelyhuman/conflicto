use std::fs;
use std::path::Path;

pub fn write_working_tree_file(root: &Path, rel_path: &str, contents: &str) -> std::io::Result<()> {
    let path = root.join(rel_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)
}
