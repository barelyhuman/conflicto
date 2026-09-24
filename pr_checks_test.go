package main

import "testing"

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

func TestPendingByWorkflow(t *testing.T) {
	checks := []PRCheck{
		{Workflow: "CI", Bucket: "pending"},
		{Workflow: "CI", Bucket: "pass"},
		{Workflow: "Deploy", Bucket: "pass"},
	}
	m := pendingByWorkflow(checks)
	if m["CI"] != 1 {
		t.Fatalf("CI pending = %d, want 1", m["CI"])
	}
	if m["Deploy"] != 0 {
		t.Fatalf("Deploy pending = %d, want 0", m["Deploy"])
	}
}

func TestWorkflowKey(t *testing.T) {
	if workflowKey("") != "Checks" {
		t.Fatal("empty workflow key")
	}
}
