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
		homebrewPaths := []string{
			"/opt/homebrew/bin/" + name,
			"/opt/homebrew/sbin/" + name,
			"/usr/local/bin/" + name,
			"/usr/local/sbin/" + name,
		}
		if home, err := os.UserHomeDir(); err == nil {
			homebrewPaths = append(homebrewPaths,
				filepath.Join(home, ".local", "bin", name),
				filepath.Join(home, ".local", "share", "mise", "shims", name),
			)
		}
		for _, path := range homebrewPaths {
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
