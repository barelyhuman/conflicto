package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const prChecksPollInterval = 15 * time.Second

// PRCheck is one CI check row from `gh pr checks --json`.
type PRCheck struct {
	Name     string `json:"name"`
	State    string `json:"state"`
	Bucket   string `json:"bucket"`
	Workflow string `json:"workflow"`
	Link     string `json:"link"`
}

// PRChecksSummary is emitted to the frontend on each poll.
type PRChecksSummary struct {
	Number  int       `json:"number"`
	Status  string    `json:"status"`
	Pending int       `json:"pending"`
	Pass    int       `json:"pass"`
	Fail    int       `json:"fail"`
	Total   int       `json:"total"`
	Checks  []PRCheck `json:"checks"`
}

type prChecksMonitor struct {
	mu sync.Mutex

	cancel context.CancelFunc
	number int

	initialized         bool
	allCompleteNotified bool
	workflows           map[string]*workflowTrack
}

type workflowTrack struct {
	hadPending       bool
	completeNotified bool
}

func newPRChecksMonitor() *prChecksMonitor {
	return &prChecksMonitor{
		workflows: make(map[string]*workflowTrack),
	}
}

func (m *prChecksMonitor) stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.number = 0
	m.resetTrackingLocked()
}

func (m *prChecksMonitor) resetTrackingLocked() {
	m.initialized = false
	m.allCompleteNotified = false
	m.workflows = make(map[string]*workflowTrack)
}

func summarizePRChecks(number int, checks []PRCheck) PRChecksSummary {
	summary := PRChecksSummary{
		Number: number,
		Checks: checks,
		Total:  len(checks),
		Status: "none",
	}
	for _, c := range checks {
		switch c.Bucket {
		case "pending":
			summary.Pending++
		case "pass", "skipping":
			summary.Pass++
		case "fail", "cancel":
			summary.Fail++
		default:
			if isPendingBucket(c.Bucket, c.State) {
				summary.Pending++
			}
		}
	}
	switch {
	case summary.Total == 0:
		summary.Status = "none"
	case summary.Pending > 0:
		summary.Status = "running"
	case summary.Fail > 0:
		summary.Status = "failure"
	default:
		summary.Status = "success"
	}
	return summary
}

func isPendingBucket(bucket, state string) bool {
	if bucket == "pending" {
		return true
	}
	switch state {
	case "PENDING", "IN_PROGRESS", "QUEUED", "WAITING", "REQUESTED":
		return true
	default:
		return false
	}
}

func workflowKey(workflow string) string {
	if workflow == "" {
		return "Checks"
	}
	return workflow
}

func pendingByWorkflow(checks []PRCheck) map[string]int {
	out := make(map[string]int)
	for _, c := range checks {
		key := workflowKey(c.Workflow)
		if isPendingBucket(c.Bucket, c.State) {
			out[key]++
		}
	}
	return out
}

func (a *App) fetchPRChecks(number int) ([]PRCheck, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no git repository")
	}
	cmd := appCommand(
		"gh", "pr", "checks", strconv.Itoa(number),
		"--json", "name,state,bucket,workflow,link",
	)
	cmd.Dir = a.git.path
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var checks []PRCheck
	if err := json.Unmarshal(out, &checks); err != nil {
		return nil, err
	}
	return checks, nil
}

// StartPRChecksMonitor polls CI for the given PR until stopped or switched.
func (a *App) StartPRChecksMonitor(number int) {
	if number <= 0 {
		return
	}
	if a.prChecks == nil {
		a.prChecks = newPRChecksMonitor()
	}

	a.prChecks.mu.Lock()
	if a.prChecks.number == number && a.prChecks.cancel != nil {
		a.prChecks.mu.Unlock()
		return
	}
	if a.prChecks.cancel != nil {
		a.prChecks.cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.prChecks.cancel = cancel
	a.prChecks.number = number
	a.prChecks.resetTrackingLocked()
	a.prChecks.mu.Unlock()

	go a.runPRChecksMonitor(ctx, number)
}

// StopPRChecksMonitor stops CI polling.
func (a *App) StopPRChecksMonitor() {
	if a.prChecks == nil {
		return
	}
	a.prChecks.stop()
}

func (a *App) runPRChecksMonitor(ctx context.Context, number int) {
	tick := func() {
		checks, err := a.fetchPRChecks(number)
		if err != nil {
			a.EmitEvent("prChecksUpdated", map[string]interface{}{
				"number": number,
				"error":  err.Error(),
			})
			return
		}
		summary := summarizePRChecks(number, checks)
		a.EmitEvent("prChecksUpdated", summary)
		a.maybeNotifyPRChecks(number, summary)
	}

	tick()
	ticker := time.NewTicker(prChecksPollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tick()
		}
	}
}

func (a *App) maybeNotifyPRChecks(number int, summary PRChecksSummary) {
	if a.settings == nil || !a.settings.CINotificationsEnabled {
		return
	}
	mode := a.settings.CINotificationMode
	if mode == "" || mode == "off" {
		return
	}
	if a.prChecks == nil {
		return
	}

	a.prChecks.mu.Lock()
	defer a.prChecks.mu.Unlock()

	if a.prChecks.number != number {
		return
	}

	pendingMap := pendingByWorkflow(summary.Checks)
	allKeys := make(map[string]struct{})
	for k := range pendingMap {
		allKeys[k] = struct{}{}
	}
	for _, c := range summary.Checks {
		allKeys[workflowKey(c.Workflow)] = struct{}{}
	}

	for key := range allKeys {
		if _, ok := a.prChecks.workflows[key]; !ok {
			a.prChecks.workflows[key] = &workflowTrack{}
		}
	}

	if !a.prChecks.initialized {
		for key := range allKeys {
			a.prChecks.workflows[key].hadPending = pendingMap[key] > 0
		}
		if summary.Total > 0 && summary.Pending == 0 {
			a.prChecks.allCompleteNotified = true
		}
		a.prChecks.initialized = true
		return
	}

	titleBase := fmt.Sprintf("PR #%d CI", number)

	if mode == "workflow" {
		for key, track := range a.prChecks.workflows {
			pending := pendingMap[key]
			if track.hadPending && pending == 0 && !track.completeNotified {
				track.completeNotified = true
				a.sendCINotification(
					titleBase,
					fmt.Sprintf("%s checks finished", key),
				)
			}
			track.hadPending = pending > 0
		}
		return
	}

	if mode == "all" && summary.Total > 0 && summary.Pending == 0 && !a.prChecks.allCompleteNotified {
		a.prChecks.allCompleteNotified = true
		body := "All checks finished"
		if summary.Fail > 0 {
			body = fmt.Sprintf("All checks finished (%d failed)", summary.Fail)
		}
		a.sendCINotification(titleBase, body)
	}
	if mode == "all" && summary.Pending > 0 {
		a.prChecks.allCompleteNotified = false
	}
}

func (a *App) sendCINotification(title, body string) {
	if a.ctx == nil {
		return
	}
	if !runtime.IsNotificationAvailable(a.ctx) {
		return
	}
	_ = runtime.SendNotification(a.ctx, runtime.NotificationOptions{
		Title: title,
		Body:  body,
	})
}
