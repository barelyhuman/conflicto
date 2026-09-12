package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const singleInstanceID = "com.barelyhuman.conflicto"

// normalizeLaunchArgs converts relative project paths in os.Args to absolute paths
// using the current working directory. This runs before Wails forwards args to an
// already-running instance (macOS uses executable dir as WorkingDirectory).
func normalizeLaunchArgs() {
	if len(os.Args) <= 1 {
		return
	}

	cwd, err := os.Getwd()
	if err != nil {
		return
	}

	for i := 1; i < len(os.Args); i++ {
		arg := os.Args[i]
		if strings.HasPrefix(arg, "-") {
			continue
		}
		if filepath.IsAbs(arg) {
			continue
		}
		abs, err := filepath.Abs(filepath.Join(cwd, arg))
		if err != nil {
			continue
		}
		os.Args[i] = abs
	}
}

// launchPathFromArgs returns the first positional argument from os.Args, if any.
func launchPathFromArgs() (string, bool) {
	return resolveLaunchPath(os.Args[1:], "")
}

// resolveLaunchPath picks the first non-flag argument and resolves it to an absolute path.
func resolveLaunchPath(args []string, workingDir string) (string, bool) {
	for _, arg := range args {
		if arg == "" || strings.HasPrefix(arg, "-") {
			continue
		}

		path := arg
		if !filepath.IsAbs(path) {
			base := workingDir
			if base == "" {
				cwd, err := os.Getwd()
				if err != nil {
					return "", false
				}
				base = cwd
			}
			abs, err := filepath.Abs(filepath.Join(base, path))
			if err != nil {
				return "", false
			}
			path = abs
		}

		path = filepath.Clean(path)
		return path, true
	}

	return "", false
}

func (a *App) setPendingLaunchPath(path string) {
	a.pendingLaunchPath = filepath.Clean(path)
}

func (a *App) openPendingLaunchPathOnce() {
	if a.pendingLaunchPath == "" || a.pendingLaunchOpened {
		return
	}
	a.pendingLaunchOpened = true

	if err := a.switchToProject(a.pendingLaunchPath); err != nil {
		a.EmitEvent("error", map[string]string{
			"message": fmt.Sprintf("Failed to open project: %v", err),
		})
	}
}

func (a *App) onSecondInstanceLaunch(data options.SecondInstanceData) {
	if a.ctx == nil {
		return
	}

	path, ok := resolveLaunchPath(data.Args, data.WorkingDirectory)
	if ok {
		if err := a.switchToProject(path); err != nil {
			a.EmitEvent("error", map[string]string{
				"message": fmt.Sprintf("Failed to open project: %v", err),
			})
		}
	}

	runtime.WindowUnminimise(a.ctx)
	runtime.WindowShow(a.ctx)
}
