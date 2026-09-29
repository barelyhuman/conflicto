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
	Status  string    `json:"status"` // none | running | success | failure
	Pending int       `json:"pending"`
	Pass    int       `json:"pass"`
	Fail    int       `json:"fail"`
	Total   int       `json:"total"`
	Checks  []PRCheck `json:"checks"`
}

// ciNotification is a desktop notification to send (I/O happens at the edge).
type ciNotification struct {
	Title string
	Body  string
}

// ciWatchState tracks pending→done edges across polls so we only notify once per cycle.
type ciWatchState struct {
	Primed      bool
	AllNotified bool
	Pending     map[string]bool // workflow → currently pending
	WFNotified  map[string]bool // workflow → already notified for current done cycle
}

func emptyCIWatchState() ciWatchState {
	return ciWatchState{
		Pending:    map[string]bool{},
		WFNotified: map[string]bool{},
	}
}

type prChecksMonitor struct {
	mu     sync.Mutex
	cancel context.CancelFunc
	number int
	watch  ciWatchState
}

func newPRChecksMonitor() *prChecksMonitor {
	return &prChecksMonitor{watch: emptyCIWatchState()}
}

func (m *prChecksMonitor) stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.number = 0
	m.watch = emptyCIWatchState()
}

// checkKind maps a gh check row into pending | pass | fail | other.
func checkKind(c PRCheck) string {
	switch c.Bucket {
	case "pending":
		return "pending"
	case "pass", "skipping":
		return "pass"
	case "fail", "cancel":
		return "fail"
	}
	switch c.State {
	case "PENDING", "IN_PROGRESS", "QUEUED", "WAITING", "REQUESTED":
		return "pending"
	default:
		return "other"
	}
}

func workflowKey(workflow string) string {
	if workflow == "" {
		return "Checks"
	}
	return workflow
}

func summarizePRChecks(number int, checks []PRCheck) PRChecksSummary {
	summary := PRChecksSummary{
		Number: number,
		Checks: checks,
		Total:  len(checks),
		Status: "none",
	}
	for _, c := range checks {
		switch checkKind(c) {
		case "pending":
			summary.Pending++
		case "pass":
			summary.Pass++
		case "fail":
			summary.Fail++
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

// workflowPending returns workflow → has any pending check.
func workflowPending(checks []PRCheck) map[string]bool {
	out := make(map[string]bool)
	for _, c := range checks {
		key := workflowKey(c.Workflow)
		if checkKind(c) == "pending" {
			out[key] = true
		} else if _, ok := out[key]; !ok {
			out[key] = false
		}
	}
	return out
}

// advanceCINotify is pure: previous watch + summary + mode → next watch + notifications.
// mode: "off" | "all" | "workflow". Watch state always advances; notes only when mode matches.
func advanceCINotify(prev ciWatchState, summary PRChecksSummary, mode string) (ciWatchState, []ciNotification) {
	cur := workflowPending(summary.Checks)
	next := ciWatchState{
		Primed:      true,
		AllNotified: prev.AllNotified,
		Pending:     cur,
		WFNotified:  copyBoolMap(prev.WFNotified),
	}

	if !prev.Primed {
		// Seed without firing: already-idle PR should not notify on open.
		if summary.Total > 0 && summary.Pending == 0 {
			next.AllNotified = true
			for k := range cur {
				next.WFNotified[k] = true
			}
		}
		return next, nil
	}

	title := fmt.Sprintf("PR #%d CI", summary.Number)
	var notes []ciNotification

	if summary.Pending > 0 {
		next.AllNotified = false
	} else if summary.Total > 0 && !prev.AllNotified {
		next.AllNotified = true
		if mode == "all" {
			body := "All checks finished"
			if summary.Fail > 0 {
				body = fmt.Sprintf("All checks finished (%d failed)", summary.Fail)
			}
			notes = append(notes, ciNotification{Title: title, Body: body})
		}
	}

	keys := make(map[string]struct{}, len(prev.Pending)+len(cur))
	for k := range prev.Pending {
		keys[k] = struct{}{}
	}
	for k := range cur {
		keys[k] = struct{}{}
	}
	for k := range keys {
		wasPending := prev.Pending[k]
		nowPending := cur[k]
		if nowPending {
			next.WFNotified[k] = false
			continue
		}
		if wasPending && !prev.WFNotified[k] {
			next.WFNotified[k] = true
			if mode == "workflow" {
				notes = append(notes, ciNotification{
					Title: title,
					Body:  fmt.Sprintf("%s checks finished", k),
				})
			}
		}
	}

	return next, notes
}

func copyBoolMap(in map[string]bool) map[string]bool {
	out := make(map[string]bool, len(in))
	for k, v := range in {
		out[k] = v
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

func (a *App) ciNotifyMode() string {
	if a.settings == nil {
		return "off"
	}
	mode := a.settings.CINotificationMode
	switch mode {
	case "all", "workflow", "off":
		return mode
	default:
		return "off"
	}
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
	a.prChecks.watch = emptyCIWatchState()
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
		a.applyCINotifications(number, summary)
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

func (a *App) applyCINotifications(number int, summary PRChecksSummary) {
	if a.prChecks == nil {
		return
	}
	mode := a.ciNotifyMode()

	a.prChecks.mu.Lock()
	if a.prChecks.number != number {
		a.prChecks.mu.Unlock()
		return
	}
	next, notes := advanceCINotify(a.prChecks.watch, summary, mode)
	a.prChecks.watch = next
	a.prChecks.mu.Unlock()

	for _, n := range notes {
		a.sendCINotification(n.Title, n.Body)
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
