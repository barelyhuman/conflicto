package main

import (
	"context"
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed resources/app-icon/conflicto.png
var appIcon []byte

func main() {
	app := NewApp()

	AppMenu := menu.NewMenu()

	// Edit Menu
	EditMenu := AppMenu.AddSubmenu("Edit")
	EditMenu.AddSeparator()
	EditMenu.AddText("Undo", keys.CmdOrCtrl("z"), nil)
	EditMenu.AddText("Redo", keys.CmdOrCtrl("shift+z"), nil)
	EditMenu.AddSeparator()
	EditMenu.AddText("Cut", keys.CmdOrCtrl("x"), nil)
	EditMenu.AddText("Copy", keys.CmdOrCtrl("c"), nil)
	EditMenu.AddText("Paste", keys.CmdOrCtrl("v"), nil)
	EditMenu.AddText("Select All", keys.CmdOrCtrl("a"), nil)

	// View Menu
	ViewMenu := AppMenu.AddSubmenu("View")
	ViewMenu.AddText("Reload", keys.CmdOrCtrl("r"), func(cd *menu.CallbackData) {
		app.Refresh()
	})
	ViewMenu.AddSeparator()
	ViewMenu.AddText("Full Screen", keys.CmdOrCtrl("f"), func(cd *menu.CallbackData) {
		// Handled by Wails runtime
	})

	// Window Menu
	WindowMenu := AppMenu.AddSubmenu("Window")
	WindowMenu.AddText("Minimize", keys.CmdOrCtrl("m"), nil)
	WindowMenu.AddSeparator()
	WindowMenu.AddText("Close", keys.CmdOrCtrl("w"), nil)

	// Help Menu
	HelpMenu := AppMenu.AddSubmenu("Help")
		HelpMenu.AddText("Preferences...", keys.CmdOrCtrl("comma"), func(cd *menu.CallbackData) {
		app.EmitEvent("openPreferences", nil)
	})
	HelpMenu.AddSeparator()
	HelpMenu.AddText("About conflicto", nil, nil)

	err := wails.Run(&options.App{
		Title:         "conflicto",
		Width:         1126,
		Height:        768,
		MinWidth:      800,
		MinHeight:     600,
		MaxWidth:      1920,
		MaxHeight:     1080,
		DisableResize: false,
		Fullscreen:    false,
		Frameless:     false,
		Menu:          AppMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 17, G: 17, B: 17, A: 1},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHidden(),
			Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: false,
			About: &mac.AboutInfo{
				Title:   "conflicto",
				Message: "© 2026 conflicto",
				Icon:    appIcon,
			},
		},
		OnStartup: func(ctx context.Context) {
			setDockIcon(appIcon)
			app.startup(ctx)
		},
		OnDomReady: app.domReady,
		OnShutdown: app.shutdown,
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
