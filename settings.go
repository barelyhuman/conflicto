package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Settings represents the application settings
type Settings struct {
	GitHubToken string `json:"githubToken,omitempty"`
	Theme       string `json:"theme,omitempty"`
}

// settingsFilePath returns the path to the settings file
func settingsFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}

	configDir := filepath.Join(home, ".config", "conflicto")
	os.MkdirAll(configDir, 0755)

	return filepath.Join(configDir, "settings.json")
}

// LoadSettings loads settings from the config file
func LoadSettings() *Settings {
	path := settingsFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return &Settings{}
	}

	var settings Settings
	err = json.Unmarshal(data, &settings)
	if err != nil {
		fmt.Println("Error parsing settings:", err)
		return &Settings{}
	}

	return &settings
}

// Save saves settings to the config file
func (s *Settings) Save() error {
	path := settingsFilePath()
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// SetGitHubToken sets the GitHub token
func (s *Settings) SetGitHubToken(token string) {
	s.GitHubToken = token
}

// GetGitHubToken returns the GitHub token
func (s *Settings) GetGitHubToken() string {
	return s.GitHubToken
}
