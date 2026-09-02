package main

import (
	"context"
	"embed"
	goruntime "runtime"

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
	bootstrapCommandEnvironment()

	app := NewApp()

	AppMenu := menu.NewMenu()
	if goruntime.GOOS == "darwin" {
		// AppMenu + EditMenu roles are required on macOS so Quit and
		// text-editing shortcuts (Cmd+A/C/V/X/Z) work in webview inputs.
		AppMenu.Append(menu.AppMenu())
		AppMenu.Append(menu.EditMenu())
	}

	// View Menu
	ViewMenu := AppMenu.AddSubmenu("View")
	ViewMenu.AddText("Reload", keys.CmdOrCtrl("r"), func(cd *menu.CallbackData) {
		app.Refresh()
	})
	ViewMenu.AddSeparator()
	// macOS system convention is Control+Command+F for fullscreen
	fullscreenAccel := keys.CmdOrCtrl("f")
	if goruntime.GOOS == "darwin" {
		fullscreenAccel = keys.Combo("f", keys.CmdOrCtrlKey, keys.ControlKey)
	}
	ViewMenu.AddText("Full Screen", fullscreenAccel, func(cd *menu.CallbackData) {
		app.ToggleFullscreen()
	})

	// Window Menu
	WindowMenu := AppMenu.AddSubmenu("Window")
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
		DisableResize: false,
		Fullscreen:    false,
		Frameless:     false,
		Menu:          AppMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Transparent webview + native vibrancy for sidebar frost.
		// TitleBarHidden keeps system traffic lights over full-size content.
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHidden(),
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			About: &mac.AboutInfo{
				Title:   "conflicto",
				Message: "© 2026 conflicto",
				Icon:    appIcon,
			},
		},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
		},
		OnDomReady:    app.domReady,
		OnShutdown:    app.shutdown,
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
