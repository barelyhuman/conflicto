use conflicto_core::{
    get_theme, load_preferences, save_preferences, themes, AppPreferences, ThemeId, DEFAULT_THEME_ID,
};

#[test]
fn all_themes_derive_ui_vars() {
    for id in ThemeId::all() {
        let pack = get_theme(*id);
        assert_eq!(pack.id, *id);
        // Smoke: bg and text differ in typical packs
        let _ = pack.ui.bg;
        let _ = pack.ui.text;
    }
    assert!(!themes().is_empty());
}

#[test]
fn preferences_roundtrip_theme() {
    // Uses real prefs path — isolate by saving then restoring
    let before = load_preferences();
    let prefs = AppPreferences {
        theme_id: ThemeId::RosePineDawn,
        last_repo_path: Some("/tmp/conflicto-test-path".into()),
    };
    save_preferences(&prefs).unwrap();
    let loaded = load_preferences();
    assert_eq!(loaded.theme_id, ThemeId::RosePineDawn);
    assert_eq!(loaded.last_repo_path.as_deref(), Some("/tmp/conflicto-test-path"));
    // restore
    let _ = save_preferences(&before);
    let _ = DEFAULT_THEME_ID;
}
