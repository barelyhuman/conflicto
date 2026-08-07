import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import './app.css';
import { setupWailsEvents, api, watchFullscreen } from './wails.js';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { EditProvider } from './components/EditProvider.jsx';
import { PRPicker } from './components/PRPicker.jsx';
import { WorktreeIndicator } from './components/WorktreeIndicator.jsx';
import { FileTree } from './components/FileTree.jsx';
import { DiffViewer } from './components/DiffViewer.jsx';
import { ConflictViewer } from './components/ConflictViewer.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { ToastContainer } from './components/ToastContainer.jsx';
import { PreferencesPage } from './components/PreferencesPage.jsx';
import { ProjectPicker } from './components/ProjectPicker.jsx';
import { PRCheckoutPrompt } from './components/PRCheckoutPrompt.jsx';
import { CreatePRModal } from './components/CreatePRModal.jsx';
import { TerminalDock, isTerminalFocusTarget } from './components/terminal/TerminalDock.jsx';

/** Stable empty list so FileTree does not remount on unrelated App re-renders. */
const EMPTY_FILES = [];

export function App() {
  const [activeFile, setActiveFile] = useState(null);
  const [activePR, setActivePR] = useState(null);
  const [staged, setStaged] = useState([]);
  const [unstaged, setUnstaged] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [branches, setBranches] = useState({ current: 'main', local: [], remote: [] });

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStageFile, setPendingStageFile] = useState(null);

  // Status bar state
  const [behind, setBehind] = useState(0);
  const [ahead, setAhead] = useState(0);

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Preferences state
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Active diff data (from Go events)
  const [activeDiff, setActiveDiff] = useState(null);

  // Project state
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [recentProjects, setRecentProjects] = useState([]);

  // macOS titlebar state
  const [isMacOS, setIsMacOS] = useState(false);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);

  // GitHub / PR state
  const [ghStatus, setGhStatus] = useState({ installed: false, version: '', user: '' });
  const [prList, setPrList] = useState([]);
  const [prComments, setPrComments] = useState([]);
  const [prPrompt, setPrPrompt] = useState(null);
  // Create PR modal
  const [createPROpen, setCreatePROpen] = useState(false);

  // Terminal dock
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const terminalPrefsReady = useRef(false);
  const terminalOpenRef = useRef(terminalOpen);
  const terminalHeightRef = useRef(terminalHeight);
  useEffect(() => { terminalOpenRef.current = terminalOpen; }, [terminalOpen]);
  useEffect(() => { terminalHeightRef.current = terminalHeight; }, [terminalHeight]);

  // Refs for stable access in event callbacks
  const activeFileRef = useRef(activeFile);
  const activePRRef = useRef(activePR);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);
  useEffect(() => { activePRRef.current = activePR; }, [activePR]);

  // Derived PR mode flags (must be declared before effects that reference them)
  const isPRMode = activePR != null;
  const currentPR = isPRMode ? prList.find((p) => p.number === activePR) : null;
  const currentDiff = activeDiff;
  const isConflictActive = !isPRMode && activeFile && conflicts.some((f) => f.path === activeFile);

  // Setup Wails events
  useEffect(() => {
    setupWailsEvents({
      onFileStatusChanged: (data) => {
        setStaged(data.staged ?? []);
        setUnstaged(data.unstaged ?? []);
        setConflicts(data.conflicts ?? []);
        // Set initial active file if none set
        setActiveFile((prev) => {
          if (prev) return prev;
          const all = [...(data.conflicts ?? []), ...(data.staged ?? []), ...(data.unstaged ?? [])];
          return all[0]?.path ?? null;
        });
      },
      onBranchChanged: (data) => {
        setBranches(data);
      },
      onAheadBehindUpdated: (data) => {
        setBehind(data.behind ?? 0);
        setAhead(data.ahead ?? 0);
      },
      onDiffLoaded: (data) => {
        setActiveDiff(data);
      },
      onGHStatusChanged: (data) => {
        setGhStatus(data ?? { installed: false, version: '', user: '' });
      },
      onPRListUpdated: (data) => {
        setPrList(data?.prs ?? []);
      },
      onPRFilesUpdated: (data) => {
        const number = data?.number;
        const files = data?.files ?? [];
        if (number == null) return;
        setPrList((prev) =>
          prev.map((pr) =>
            pr.number === number ? { ...pr, files } : pr
          )
        );
        // Auto-select first file if this is the active PR and no file selected
        setActivePR((currentPR) => {
          if (currentPR === number && !activeFileRef.current && files.length > 0) {
            setActiveFile(files[0].path);
          }
          return currentPR;
        });
      },
      onPRCommentsUpdated: (data) => {
        try {
          const raw = JSON.parse(data?.raw ?? '[]');
          setPrComments(Array.isArray(raw) ? raw : []);
        } catch {
          setPrComments([]);
        }
      },
      onPRCommentPosted: () => {
        if (activePRRef.current != null) {
          api.getPRComments(activePRRef.current);
        }
      },
      onPRCheckoutCompleted: () => {
        setPrPrompt(null);
      },
      onPRCreated: () => {
        setCreatePROpen(false);
      },
      onError: (data) => {
        const toast = {
          id: Date.now().toString(),
          title: data?.title ?? 'Error',
          message: data?.message ?? '',
        };
        setToasts((prev) => [...prev, toast]);
      },
      onOpenPreferences: () => {
        setPreferencesOpen(true);
      },
      onProjectChanged: (data) => {
        setProjectName(data.name ?? '');
        setProjectPath(data.path ?? '');
        setActiveFile(null);
        setActiveDiff(null);
        setActivePR(null);
      },
      onRecentProjectsUpdated: (data) => {
        setRecentProjects(data.projects ?? []);
      },
      onPlatformInfo: (data) => {
        if (data?.platform === 'darwin') {
          setIsMacOS(true);
        }
      },
      onRefreshCompleted: () => {
        // Re-fetch diff for the currently active file
        const file = activeFileRef.current;
        const pr = activePRRef.current;
        if (file && pr == null) {
          api.getDiff(file);
        } else if (file && pr != null) {
          api.getPRFileDiff(pr, file);
        }
      },
    });
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + ,
  useEffect(() => {
    function onKey(e) {
      if (isTerminalFocusTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setPreferencesOpen((open) => !open);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Toggle terminal with Ctrl+` (works even when terminal is focused)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '`' || !e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      setTerminalOpen((open) => {
        if (open && document.activeElement && isTerminalFocusTarget(document.activeElement)) {
          document.activeElement.blur();
        }
        return !open;
      });
    }
    // Capture so xterm does not eat Ctrl+` before we toggle
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // Load + persist terminal prefs
  useEffect(() => {
    api.getTerminalPrefs().then((prefs) => {
      if (prefs?.terminalHeight) setTerminalHeight(prefs.terminalHeight);
      if (typeof prefs?.terminalOpen === 'boolean') setTerminalOpen(prefs.terminalOpen);
      terminalPrefsReady.current = true;
    });
  }, []);

  useEffect(() => {
    if (!terminalPrefsReady.current) return;
    const t = setTimeout(() => {
      api.setTerminalPrefs(terminalOpenRef.current, terminalHeightRef.current);
    }, 200);
    return () => clearTimeout(t);
  }, [terminalOpen, terminalHeight]);

  const handleTerminalHeight = useCallback((h) => {
    setTerminalHeight(h);
  }, []);

  // Seed initial project state
  useEffect(() => {
    api.getCurrentProject().then((proj) => {
      if (proj) {
        setProjectName(proj.name ?? '');
        setProjectPath(proj.path ?? '');
      }
    });
    api.getRecentProjects().then((list) => {
      setRecentProjects(list ?? []);
    });
  }, []);

  // macOS titlebar: watch fullscreen state once we know we're on macOS
  useEffect(() => {
    if (!isMacOS) return;

    const cleanup = watchFullscreen((fullscreen) => {
      setIsFullscreenMode(fullscreen);
    }, 500);

    return () => cleanup();
  }, [isMacOS]);

  // Fetch diff when active file changes
  useEffect(() => {
    if (!activeFile) return;
    if (isPRMode && activePR != null) {
      api.getPRFileDiff(activePR, activeFile);
    } else {
      api.getDiff(activeFile);
    }
  }, [activeFile, isPRMode, activePR]);

  // Fetch PR comments when active PR changes
  useEffect(() => {
    if (isPRMode && activePR != null) {
      api.getPRComments(activePR);
    } else {
      setPrComments([]);
    }
  }, [isPRMode, activePR]);

  const handleSelectPR = useCallback((pr) => {
    if (pr) {
      setPrList((prev) =>
        prev.some((p) => p.number === pr.number) ? prev : [...prev, pr]
      );
      setPrPrompt(pr);
    } else {
      setActivePR(null);
      setActiveFile(staged[0]?.path ?? unstaged[0]?.path ?? conflicts[0]?.path ?? null);
      setActiveDiff(null);
    }
  }, [staged, unstaged, conflicts]);

  function pushToast(title, message) {
    setToasts((prev) => [...prev, { id: Date.now().toString(), title, message }]);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const handleViewPRDiff = useCallback((pr) => {
    setPrPrompt(null);
    setActivePR(pr.number);
    if (pr.files && pr.files.length > 0) {
      setActiveFile(pr.files[0].path);
    } else {
      setActiveFile(null);
      api.getPRFiles(pr.number);
    }
  }, []);

  const handleCheckoutPRLocal = useCallback((pr) => {
    api.checkoutPR(pr.number).catch((err) => {
      pushToast('Checkout Error', err.message);
    });
  }, []);

  const handleCheckoutPRWorktree = useCallback((pr) => {
    api.checkoutPRToWorktree(pr.number).catch((err) => {
      pushToast('Worktree Error', err.message);
    });
  }, []);

  const handleSelectBranch = useCallback((branch) => {
    if (branch) {
      api.switchBranch(branch);
    }
    if (isPRMode) {
      setActivePR(null);
    }
  }, [isPRMode]);

  const handleSelectFile = useCallback((path) => {
    setActiveFile(path);
  }, []);

  const handleStage = useCallback((path) => {
    const conflictFile = conflicts.find((f) => f.path === path);
    if (conflictFile) {
      setPendingStageFile(path);
      setConfirmOpen(true);
      return;
    }

    api.stageFile(path).catch((err) => {
      pushToast('Stage Error', err.message);
    });
  }, [conflicts]);

  const handleConfirmStageConflict = useCallback(() => {
    api.stageFile(pendingStageFile).catch((err) => {
      pushToast('Stage Error', err.message);
    });
    setConfirmOpen(false);
    setPendingStageFile(null);
  }, [pendingStageFile]);

  const handleCancelStageConflict = useCallback(() => {
    setConfirmOpen(false);
    setPendingStageFile(null);
  }, []);

  const handleUnstage = useCallback((path) => {
    api.unstageFile(path).catch((err) => {
      pushToast('Unstage Error', err.message);
    });
  }, []);

  const handlePull = useCallback(() => {
    api.pull().catch((err) => {
      pushToast(err?.title ?? 'Pull Error', err?.message ?? String(err));
    });
  }, []);

  const handlePush = useCallback(() => {
    api.push().catch((err) => {
      pushToast(err?.title ?? 'Push Error', err?.message ?? String(err));
    });
  }, []);

  const handlePostComment = useCallback((path, body, line, side) => {
    if (activePR == null) return;
    api.postPRComment(activePR, path, body, line, side, 0, '').catch((err) => {
      pushToast('Comment Error', err.message);
    });
  }, [activePR]);

  const handleCreatePR = useCallback((title, body, baseBranch, draft) => {
    api.createPR(title, body, baseBranch, draft).catch((err) => {
      pushToast('Create PR Error', err.message);
    });
  }, []);

  const handleOpenProject = useCallback(() => {
    api.openProject().catch((err) => {
      pushToast('Open Project Error', err.message);
    });
  }, []);

  const handleSwitchProject = useCallback((path) => {
    if (!path) return;
    api.switchProject(path).catch((err) => {
      pushToast('Switch Project Error', err.message);
    });
  }, []);

  const shellClass = `app-shell${isMacOS ? ' macos' : ''}${isMacOS && isFullscreenMode ? ' macos-fullscreen' : ''}`;

  const isUnstaged = unstaged.some((f) => f.path === activeFile);

  return (
    <ThemeProvider>
      <EditProvider>
        <div class={shellClass}>
          <header class="app-header">
            <div class="app-header-left">
              <ProjectPicker
                currentName={projectName}
                currentPath={projectPath}
                recents={recentProjects}
                onSwitchProject={handleSwitchProject}
                onOpenProject={handleOpenProject}
              />
            </div>
            <div class="app-header-actions">
              <button
                type="button"
                class="create-pr-trigger"
                onClick={() => setCreatePROpen(true)}
                title="Create PR"
              >
                + PR
              </button>
              <PRPicker selectedPR={activePR} currentPR={currentPR} onSelect={handleSelectPR} onError={pushToast} />
              <WorktreeIndicator path={null} />
            </div>
          </header>

          <aside class="app-sidebar">
            <FileTree
              conflicts={isPRMode ? EMPTY_FILES : conflicts}
              staged={isPRMode ? EMPTY_FILES : staged}
              unstaged={isPRMode ? EMPTY_FILES : unstaged}
              prFiles={isPRMode ? (currentPR?.files ?? EMPTY_FILES) : EMPTY_FILES}
              isPRMode={isPRMode}
              activeFile={activeFile}
              onSelect={handleSelectFile}
              onStage={handleStage}
              onUnstage={handleUnstage}
            />
          </aside>

          <main class="app-main">
            {currentDiff ? (
              isConflictActive ? (
                <ConflictViewer
                  patch={currentDiff.patch}
                  filename={currentDiff.path}
                />
              ) : (
                <DiffViewer
                  patch={currentDiff.patch}
                  filename={currentDiff.path}
                  isPRMode={isPRMode}
                  isUnstaged={false}
                  comments={isPRMode ? prComments : []}
                  onPostComment={handlePostComment}
                />
              )
            ) : (
              <div class="diff-empty">Select a file to view changes</div>
            )}
          </main>

          <TerminalDock
            open={terminalOpen}
            height={terminalHeight}
            onHeightChange={handleTerminalHeight}
            projectPath={projectPath}
            onRequestOpen={() => setTerminalOpen(true)}
          />

          <ConfirmDialog
            open={confirmOpen}
            filename={pendingStageFile ?? ''}
            onConfirm={handleConfirmStageConflict}
            onCancel={handleCancelStageConflict}
          />

          <StatusBar
            behind={behind}
            ahead={ahead}
            onPull={handlePull}
            onPush={handlePush}
            onSelectBranch={handleSelectBranch}
            currentBranch={branches.current}
            localBranches={branches.local}
            remoteBranches={branches.remote}
          />

          <ToastContainer
            toasts={toasts}
            onDismiss={dismissToast}
          />

          <PreferencesPage
            open={preferencesOpen}
            onClose={() => setPreferencesOpen(false)}
            ghStatus={ghStatus}
            onRefreshGH={() => api.detectGH()}
          />

          <CreatePRModal
            open={createPROpen}
            onClose={() => setCreatePROpen(false)}
            baseBranches={branches.local}
            onSubmit={handleCreatePR}
          />

          <PRCheckoutPrompt
            pr={prPrompt}
            onViewDiff={() => handleViewPRDiff(prPrompt)}
            onCheckoutLocal={() => handleCheckoutPRLocal(prPrompt)}
            onCheckoutWorktree={() => handleCheckoutPRWorktree(prPrompt)}
            onClose={() => setPrPrompt(null)}
          />
        </div>
      </EditProvider>
    </ThemeProvider>
  );
}
