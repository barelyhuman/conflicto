//go:build darwin

package main

import (
	"os"
	"os/exec"
	"strings"
)

func platformCLIFallbackPaths() string {
	home, _ := os.UserHomeDir()
	segments := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
	}
	if home != "" {
		segments = append(segments,
			home+"/.local/bin",
			home+"/.local/share/mise/shims",
		)
	}
	return strings.Join(segments, ":")
}

func platformShellPath() string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	user := os.Getenv("USER")
	if user == "" {
		user = os.Getenv("LOGNAME")
	}

	cmd := exec.Command(shell, "-ilc", "echo -n $PATH")
	cmd.Env = []string{
		"HOME=" + home,
		"USER=" + user,
		"LOGNAME=" + user,
		"TERM=dumb",
	}
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func applyPlatformCLIEnv() {
	// Homebrew shellenv exports more than PATH; set it when brew is present.
	for _, brew := range []string{"/opt/homebrew/bin/brew", "/usr/local/bin/brew"} {
		if _, err := os.Stat(brew); err != nil {
			continue
		}
		cmd := exec.Command(brew, "shellenv")
		cmd.Env = commandEnv()
		out, err := cmd.Output()
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if key, value, ok := strings.Cut(line, "="); ok {
				key = strings.TrimSpace(key)
				value = strings.Trim(strings.TrimSpace(value), `"'`)
				if key != "" && value != "" {
					_ = os.Setenv(key, value)
				}
			}
		}
		return
	}
}
