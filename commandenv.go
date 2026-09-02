package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// commandPath resolves a CLI without relying on the reduced PATH inherited by
// applications launched from Finder or LaunchServices.
func commandPath(name string) (string, error) {
	if filepath.IsAbs(name) || strings.ContainsRune(name, filepath.Separator) {
		if info, err := os.Stat(name); err == nil && !info.IsDir() {
			return name, nil
		}
		return "", fmt.Errorf("command %q was not found", name)
	}

	if path, err := exec.LookPath(name); err == nil {
		return path, nil
	}

	if runtime.GOOS == "darwin" {
		// A Finder-launched app does not load shell startup files. Ask the
		// user's login shell first so custom Homebrew prefixes, mise, and
		// other package managers work without app-specific path lists.
		if path := loginShellCommandPath(name); path != "" {
			return path, nil
		}

		// These are only the two documented Homebrew defaults, used when the
		// shell is unavailable or its startup files do not load.
		for _, path := range []string{
			"/opt/homebrew/bin/" + name,
			"/usr/local/bin/" + name,
		} {
			if info, err := os.Stat(path); err == nil && !info.IsDir() {
				return path, nil
			}
		}
	}

	return "", fmt.Errorf(
		"could not find %q; install it or add its location to PATH",
		name,
	)
}

func loginShellCommandPath(name string) string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	command := "command -v " + shellQuote(name)
	cmd := exec.Command(shell, "-ilc", command)
	cmd.Env = os.Environ()
	out, err := cmd.Output()
	if err != nil {
		return ""
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		path := strings.TrimSpace(lines[i])
		if filepath.IsAbs(path) {
			if info, err := os.Stat(path); err == nil && !info.IsDir() {
				return path
			}
		}
	}
	return ""
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

// appCommand creates a subprocess using the resolved executable and current
// environment. Keeping resolution at invocation time also handles tools
// installed after the app starts. If a tool is unavailable, retaining the
// original name lets exec provide its standard "executable not found" error.
func appCommand(name string, args ...string) *exec.Cmd {
	path, err := commandPath(name)
	if err != nil {
		path = name
	}
	cmd := exec.Command(path, args...)
	cmd.Env = os.Environ()
	return cmd
}
