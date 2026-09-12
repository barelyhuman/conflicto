// conflicto CLI forwards invocations to the GUI app binary.
//
// Install to PATH (e.g. /usr/local/bin/conflicto) so `conflicto .` opens the app
// at the current directory's git repo. The app binary handles single-instance
// forwarding when a window is already open.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func main() {
	appBin, err := resolveAppBinary()
	if err != nil {
		fmt.Fprintf(os.Stderr, "conflicto: %v\n", err)
		os.Exit(1)
	}

	cmd := exec.Command(appBin, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "conflicto: %v\n", err)
		os.Exit(1)
	}
}

func resolveAppBinary() (string, error) {
	if env := os.Getenv("CONFLICTO_APP"); env != "" {
		if _, err := os.Stat(env); err == nil {
			return env, nil
		}
		return "", fmt.Errorf("CONFLICTO_APP points to missing binary: %s", env)
	}

	cliPath, err := os.Executable()
	if err != nil {
		return "", err
	}
	cliPath, err = filepath.EvalSymlinks(cliPath)
	if err != nil {
		return "", err
	}

	candidates := appBinaryCandidates(cliPath)
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("could not find conflicto app binary (set CONFLICTO_APP to override)")
}

func appBinaryCandidates(cliPath string) []string {
	if runtime.GOOS == "darwin" {
		return darwinAppCandidates(cliPath)
	}

	// Linux and others: CLI is often a symlink to the same binary.
	return []string{cliPath}
}

func darwinAppCandidates(cliPath string) []string {
	home, _ := os.UserHomeDir()
	appNames := []string{
		"/Applications/conflicto.app/Contents/MacOS/conflicto",
		filepath.Join(home, "Applications/conflicto.app/Contents/MacOS/conflicto"),
	}

	// If the CLI lives inside the .app bundle, prefer that binary.
	if bundle := macOSAppBundleBinary(cliPath); bundle != "" {
		appNames = append([]string{bundle}, appNames...)
	}

	appNames = append(appNames, cliPath)
	return appNames
}

func macOSAppBundleBinary(path string) string {
	for dir := filepath.Dir(path); dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		if filepath.Base(dir) == "MacOS" && filepath.Base(filepath.Dir(dir)) == "Contents" {
			return path
		}
	}
	return ""
}
