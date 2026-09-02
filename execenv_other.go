//go:build !darwin

package main

func platformCLIFallbackPaths() string {
	return ""
}

func platformShellPath() string {
	return ""
}

func applyPlatformCLIEnv() {}
