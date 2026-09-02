package main

import (
	"os"
	"os/exec"
	"strings"
)

// bootstrapCommandEnvironment prepares PATH (and related env) so GUI-launched
// macOS builds can find user-installed CLIs such as gh and brew.
func bootstrapCommandEnvironment() {
	path := resolveCommandPath()
	if path == "" {
		return
	}
	_ = os.Setenv("PATH", path)
	applyPlatformCLIEnv()
}

func resolveCommandPath() string {
	current := os.Getenv("PATH")
	shellPath := platformShellPath()
	fallbacks := platformCLIFallbackPaths()
	return mergePathEntries(shellPath, fallbacks, current, "/usr/bin:/bin:/usr/sbin:/sbin")
}

func mergePathEntries(segments ...string) string {
	seen := make(map[string]struct{})
	out := make([]string, 0, 32)
	for _, segment := range segments {
		for _, dir := range strings.Split(segment, ":") {
			dir = strings.TrimSpace(dir)
			if dir == "" {
				continue
			}
			if _, ok := seen[dir]; ok {
				continue
			}
			seen[dir] = struct{}{}
			out = append(out, dir)
		}
	}
	return strings.Join(out, ":")
}

// appCommand creates a subprocess with the enriched GUI-safe environment.
func appCommand(name string, arg ...string) *exec.Cmd {
	cmd := exec.Command(resolveCLI(name), arg...)
	applyCommandEnv(cmd)
	return cmd
}

var cliPathCache = map[string]string{}

func resolveCLI(name string) string {
	if cached, ok := cliPathCache[name]; ok && cached != "" {
		return cached
	}
	if path, err := exec.LookPath(name); err == nil && path != "" {
		cliPathCache[name] = path
		return path
	}
	return name
}

func applyCommandEnv(cmd *exec.Cmd) {
	if cmd.Env == nil {
		cmd.Env = commandEnv()
		return
	}
	cmd.Env = ensurePathInEnv(cmd.Env)
}

func commandEnv() []string {
	return ensurePathInEnv(os.Environ())
}

func ensurePathInEnv(env []string) []string {
	path := os.Getenv("PATH")
	if path == "" {
		return env
	}
	out := make([]string, 0, len(env)+1)
	replaced := false
	for _, entry := range env {
		if strings.HasPrefix(entry, "PATH=") {
			out = append(out, "PATH="+path)
			replaced = true
			continue
		}
		out = append(out, entry)
	}
	if !replaced {
		out = append(out, "PATH="+path)
	}
	return out
}
