package main

import (
	"reflect"
	"testing"
)

func TestSummarizePRChecks(t *testing.T) {
	s := summarizePRChecks(12, []PRCheck{
		{Name: "a", Bucket: "pass"},
		{Name: "b", Bucket: "pending", State: "IN_PROGRESS"},
		{Name: "c", Bucket: "fail"},
	})
	if s.Status != "running" || s.Pending != 1 || s.Pass != 1 || s.Fail != 1 || s.Total != 3 {
		t.Fatalf("unexpected summary: %+v", s)
	}

	done := summarizePRChecks(1, []PRCheck{
		{Bucket: "pass"},
		{Bucket: "pass"},
	})
	if done.Status != "success" || done.Pending != 0 {
		t.Fatalf("unexpected done summary: %+v", done)
	}

	failed := summarizePRChecks(1, []PRCheck{
		{Bucket: "pass"},
		{Bucket: "fail"},
	})
	if failed.Status != "failure" {
		t.Fatalf("status = %q, want failure", failed.Status)
	}
}

func TestWorkflowPending(t *testing.T) {
	checks := []PRCheck{
		{Workflow: "CI", Bucket: "pending"},
		{Workflow: "CI", Bucket: "pass"},
		{Workflow: "Deploy", Bucket: "pass"},
	}
	m := workflowPending(checks)
	if m["CI"] != true {
		t.Fatalf("CI pending = %v, want true", m["CI"])
	}
	if m["Deploy"] != false {
		t.Fatalf("Deploy pending = %v, want false", m["Deploy"])
	}
}

func TestWorkflowKey(t *testing.T) {
	if workflowKey("") != "Checks" {
		t.Fatal("empty workflow key")
	}
}

func TestAdvanceCINotifyAll(t *testing.T) {
	running := summarizePRChecks(7, []PRCheck{
		{Workflow: "CI", Bucket: "pending"},
		{Workflow: "CI", Bucket: "pass"},
	})
	done := summarizePRChecks(7, []PRCheck{
		{Workflow: "CI", Bucket: "pass"},
		{Workflow: "CI", Bucket: "fail"},
	})

	// First poll while running: prime, no notify.
	s1, notes := advanceCINotify(emptyCIWatchState(), running, "all")
	if !s1.Primed || len(notes) != 0 {
		t.Fatalf("prime running: state=%+v notes=%v", s1, notes)
	}

	// Complete → one notification.
	s2, notes := advanceCINotify(s1, done, "all")
	if len(notes) != 1 || notes[0].Body != "All checks finished (1 failed)" {
		t.Fatalf("complete notes=%v", notes)
	}
	if !s2.AllNotified {
		t.Fatal("expected AllNotified")
	}

	// Still complete → no re-fire.
	_, notes = advanceCINotify(s2, done, "all")
	if len(notes) != 0 {
		t.Fatalf("duplicate notes=%v", notes)
	}

	// Pending again then done → notify again.
	s3, _ := advanceCINotify(s2, running, "all")
	if s3.AllNotified {
		t.Fatal("pending should clear AllNotified")
	}
	_, notes = advanceCINotify(s3, done, "all")
	if len(notes) != 1 {
		t.Fatalf("re-run notes=%v", notes)
	}
}

func TestAdvanceCINotifyWorkflow(t *testing.T) {
	running := summarizePRChecks(3, []PRCheck{
		{Workflow: "CI", Bucket: "pending"},
		{Workflow: "Deploy", Bucket: "pending"},
	})
	ciDone := summarizePRChecks(3, []PRCheck{
		{Workflow: "CI", Bucket: "pass"},
		{Workflow: "Deploy", Bucket: "pending"},
	})
	allDone := summarizePRChecks(3, []PRCheck{
		{Workflow: "CI", Bucket: "pass"},
		{Workflow: "Deploy", Bucket: "pass"},
	})

	s1, notes := advanceCINotify(emptyCIWatchState(), running, "workflow")
	if len(notes) != 0 {
		t.Fatalf("prime notes=%v", notes)
	}

	s2, notes := advanceCINotify(s1, ciDone, "workflow")
	if len(notes) != 1 || notes[0].Body != "CI checks finished" {
		t.Fatalf("ci done notes=%v", notes)
	}

	_, notes = advanceCINotify(s2, allDone, "workflow")
	if len(notes) != 1 || notes[0].Body != "Deploy checks finished" {
		t.Fatalf("deploy done notes=%v", notes)
	}
}

func TestAdvanceCINotifyAlreadyIdle(t *testing.T) {
	idle := summarizePRChecks(1, []PRCheck{{Workflow: "CI", Bucket: "pass"}})
	s1, notes := advanceCINotify(emptyCIWatchState(), idle, "all")
	if len(notes) != 0 || !s1.AllNotified {
		t.Fatalf("open idle PR should not notify: notes=%v state=%+v", notes, s1)
	}
	_, notes = advanceCINotify(s1, idle, "workflow")
	if len(notes) != 0 {
		t.Fatalf("workflow idle re-poll notes=%v", notes)
	}
}

func TestAdvanceCINotifyOff(t *testing.T) {
	running := summarizePRChecks(1, []PRCheck{{Workflow: "CI", Bucket: "pending"}})
	done := summarizePRChecks(1, []PRCheck{{Workflow: "CI", Bucket: "pass"}})

	// Off while running still primes + tracks edges.
	prev, notes := advanceCINotify(emptyCIWatchState(), running, "off")
	if len(notes) != 0 || !prev.Primed {
		t.Fatalf("off prime: notes=%v primed=%v", notes, prev.Primed)
	}
	next, notes := advanceCINotify(prev, done, "off")
	if len(notes) != 0 {
		t.Fatalf("off complete notes=%v", notes)
	}
	// Enabling after the done edge must not retro-notify.
	_, notes = advanceCINotify(next, done, "all")
	if len(notes) != 0 {
		t.Fatalf("enable after idle notes=%v", notes)
	}
}

func TestAdvanceCINotifyCopiesMaps(t *testing.T) {
	prev := emptyCIWatchState()
	prev.Primed = true
	prev.Pending["CI"] = true
	running := summarizePRChecks(1, []PRCheck{{Workflow: "CI", Bucket: "pending"}})
	next, _ := advanceCINotify(prev, running, "all")
	next.Pending["CI"] = false
	if !prev.Pending["CI"] {
		t.Fatal("advance should not mutate previous Pending map")
	}
	if reflect.DeepEqual(prev.Pending, next.Pending) && &prev.Pending == &next.Pending {
		t.Fatal("Pending maps should be distinct")
	}
}
