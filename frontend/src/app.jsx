import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { useModel, useSignal } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import './app.css';
import { setupWailsEvents, api, watchFullscreen } from './wails.js';
import { WorkingTreeModel } from './models/workingTree.js';
import { SelectionModel } from './models/selection.js';
import { SyncModel } from './models/sync.js';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { EditProvider } from './components/EditProvider.jsx';
import { FileTree } from './components/FileTree.jsx';
import { DiffViewer } from './components/DiffViewer.jsx';
import { ConflictViewer } from './components/ConflictViewer.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { ToastContainer } from './components/ToastContainer.jsx';
import { PreferencesPage } from './components/PreferencesPage.jsx';
import { ProjectPicker } from './components/ProjectPicker.jsx';
import { PRCheckoutPrompt } from './components/PRCheckoutPrompt.jsx';
import { CreatePRModal } from './components/CreatePRModal.jsx';
import { TerminalDock, isTerminalFocusTarget } from './components/terminal/TerminalDock.jsx';
import { SidebarActions } from './components/SidebarActions.jsx';
import { IslandHeader } from './components/IslandHeader.jsx';
import { WorktreesPanel } from './components/WorktreesPanel.jsx';

/** Stable empty list so FileTree does not remount on unrelated App re-renders. */
const EMPTY_FILES = [];

export function App() {
  const [activePR, setActivePR] = useState(null);
  const [branches, setBranches] = useState({ current: 'main', local: [], remote: [] });
  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** @type {['stage-conflict' | 'discard' | 'remove-worktree' | null, function]} */
  const [confirmKind, setConfirmKind] = useState(null);
  const [pendingConfirmFile, setPendingConfirmFile] = useState(null);
  const [pendingWorktreePath, setPendingWorktreePath] = useState(null);

  // Sync domain model (ahead/behind + push/pull/fetch loading states)
  const sync = useModel(() => new SyncModel({
    onError: (title, message) => pushToast(title, message),
  }));

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Preferences state
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Project state
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [recentProjects, setRecentProjects] = useState([]);
  const [worktrees, setWorktrees] = useState([]);

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

  // Sidebar visibility (toggled from the content island)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Terminal dock
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const terminalPrefsReady = useRef(false);
  const terminalOpenRef = useRef(terminalOpen);
  const terminalHeightRef = useRef(terminalHeight);
  useEffect(() => { terminalOpenRef.current = terminalOpen; }, [terminalOpen]);
  useEffect(() => { terminalHeightRef.current = terminalHeight; }, [terminalHeight]);

  // Bridge remaining PR useState into a live signal for SelectionModel.
  // Keep writes synchronous so selection's diff-fetch effect never sees a stale PR.
  const activePRSignal = useSignal(/** @type {number|null} */ (null));
  const setActivePRBoth = useCallback((next) => {
    const value = typeof next === 'function' ? next(activePRSignal.peek()) : next;
    activePRSignal.value = value;
    setActivePR(value);
  }, [activePRSignal]);

  const workingTree = useModel(() => new WorkingTreeModel({
    onError: (title, message) => {
      setToasts((prev) => [...prev, { id: Date.now().toString(), title, message }]);
    },
  }));

  const selection = useModel(() => new SelectionModel({
    workingTree,
    activePR: activePRSignal,
  }));

  // Models / PR bridge are stable for App lifetime; keep refs for the mount-once event effect.
  const workingTreeRef = useRef(workingTree);
  const selectionRef = useRef(selection);
  const activePRSignalRef = useRef(activePRSignal);
  workingTreeRef.current = workingTree;
  selectionRef.current = selection;
  activePRSignalRef.current = activePRSignal;

  const activePRRef = useRef(activePR);
  useEffect(() => { activePRRef.current = activePR; }, [activePR]);

  const isPRMode = activePR != null;
  const currentPR = isPRMode ? prList.find((p) => p.number === activePR) : null;

  // Setup Wails events
  useEffect(() => {
    setupWailsEvents({
      onFileStatusChanged: (data) => {
        const wt = workingTreeRef.current;
        const sel = selectionRef.current;
        wt.applyStatus(data);
        sel.selectFirstFromWorkingTreeIfNeeded();
      },
      onBranchChanged: (data) => {
        setBranches(data);
      },
      onAheadBehindUpdated: (data) => {
        sync.setAheadBehind(data);
      },
      onDiffLoaded: (data) => {
        selectionRef.current.applyDiff(data);
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
        if (
          activePRSignalRef.current.peek() === number &&
          !selectionRef.current.activeFile.peek() &&
          files.length > 0
        ) {
          selectionRef.current.select(files[0].path, 'pr');
        }
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
        selectionRef.current.diffLoading.value = false;
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
        selectionRef.current.clear();
        activePRSignalRef.current.value = null;
        setActivePR(null);
      },
      onRecentProjectsUpdated: (data) => {
        setRecentProjects(data.projects ?? []);
      },
      onWorktreesUpdated: (data) => {
        setWorktrees(data?.worktrees ?? []);
      },
      onPlatformInfo: (data) => {
        if (data?.platform === 'darwin') {
          setIsMacOS(true);
        }
      },
      onRefreshCompleted: () => {
        selectionRef.current.refetch();
      },
    });
  }, [sync]);

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
    api.getWorktrees().then((list) => {
      setWorktrees(list ?? []);
    }).catch(() => {
      setWorktrees([]);
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
      setActivePRBoth(null);
      selection.selectFirstFromWorkingTree();
    }
  }, [selection, setActivePRBoth]);

  function pushToast(title, message) {
    setToasts((prev) => [...prev, { id: Date.now().toString(), title, message }]);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const handleViewPRDiff = useCallback((pr) => {
    setPrPrompt(null);
    // Clear selection before entering PR mode so the diff-fetch effect does not
    // call GetPRFileDiff with a stale working-tree path against an empty cache.
    selection.clear();
    setActivePRBoth(pr.number);
    api.getPRFiles(pr.number);
  }, [selection, setActivePRBoth]);

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
      setActivePRBoth(null);
      selection.clear();
    }
  }, [isPRMode, selection, setActivePRBoth]);

  const handleStage = useCallback((path) => {
    const conflictFile = workingTree.conflicts.peek().find((f) => f.path === path);
    if (conflictFile) {
      setPendingConfirmFile(path);
      setConfirmKind('stage-conflict');
      setConfirmOpen(true);
      return;
    }
    workingTree.stage(path);
  }, [workingTree]);

  const handleDiscard = useCallback((path) => {
    setPendingConfirmFile(path);
    setConfirmKind('discard');
    setConfirmOpen(true);
  }, []);

  const handleConfirmDialog = useCallback(() => {
    const path = pendingConfirmFile;
    const worktreePath = pendingWorktreePath;
    const kind = confirmKind;
    setConfirmOpen(false);
    setPendingConfirmFile(null);
    setPendingWorktreePath(null);
    setConfirmKind(null);

    if (kind === 'remove-worktree' && worktreePath) {
      api.removeWorktree(worktreePath).catch((err) => {
        pushToast('Remove Worktree Error', err.message);
      });
      return;
    }

    if (!path) return;

    if (kind === 'stage-conflict') {
      workingTree.stage(path);
      return;
    }
    if (kind === 'discard') {
      workingTree.discard(path);
    }
  }, [pendingConfirmFile, pendingWorktreePath, confirmKind, workingTree]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmOpen(false);
    setPendingConfirmFile(null);
    setPendingWorktreePath(null);
    setConfirmKind(null);
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

  const handleRemoveWorktree = useCallback((path) => {
    setPendingWorktreePath(path);
    setConfirmKind('remove-worktree');
    setConfirmOpen(true);
  }, []);

  const shellClass = [
    'app-shell',
    isMacOS ? 'macos' : '',
    isMacOS && isFullscreenMode ? 'macos-fullscreen' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const pendingUnstagedStatus = pendingConfirmFile
    ? workingTree.unstaged.peek().find((f) => f.path === pendingConfirmFile)?.status
    : undefined;

  return (
    <ThemeProvider>
      <EditProvider>
        <div class={shellClass}>
          <div class="window">
            <div class={`window-body${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
              <aside class="sidebar" aria-hidden={!sidebarOpen}>
                <div class="sidebar-project">
                  <ProjectPicker
                    currentName={projectName}
                    currentPath={projectPath}
                    recents={recentProjects}
                    onSwitchProject={handleSwitchProject}
                    onOpenProject={handleOpenProject}
                  />
                </div>

                <SidebarActions
                  currentBranch={branches.current}
                  localBranches={branches.local}
                  remoteBranches={branches.remote}
                  onSelectBranch={handleSelectBranch}
                  sync={sync}
                />

                <WorktreesPanel
                  worktrees={worktrees}
                  currentPath={projectPath}
                  onSwitch={handleSwitchProject}
                  onRemove={handleRemoveWorktree}
                />

                <FileTree
                  workingTree={workingTree}
                  selection={selection}
                  prFiles={isPRMode ? (currentPR?.files ?? EMPTY_FILES) : EMPTY_FILES}
                  isPRMode={isPRMode}
                  currentBranch={branches.current}
                  onStage={handleStage}
                  onUnstage={(path) => workingTree.unstage(path)}
                  onDiscard={handleDiscard}
                  onStageAll={() => workingTree.stageAll()}
                  onUnstageAll={() => workingTree.unstageAll()}
                  onCommit={(message) => workingTree.commit(message)}
                />
              </aside>

              <div class="content-well">
                <div class="content">
                  <main class="app-main">
                    <IslandHeader
                      sidebarOpen={sidebarOpen}
                      onToggleSidebar={() => setSidebarOpen((open) => !open)}
                      activeFile={selection.activeFile}
                      isPRMode={isPRMode}
                      showFullDiff={selection.showFullDiff}
                      onToggleShowFullDiff={() => selection.toggleShowFullDiff()}
                      selectedPR={activePR}
                      currentPR={currentPR}
                      onSelectPR={handleSelectPR}
                      onError={pushToast}
                      onCreatePR={() => setCreatePROpen(true)}
                    />
                    <Show
                      when={selection.activeFile}
                      fallback={
                        <div class="diff-empty">Select a file to view changes</div>
                      }
                    >
                      {() => (
                        <Show
                          when={selection.isConflict}
                          fallback={
                            <DiffViewer
                              activeDiff={selection.activeDiff}
                              loading={selection.diffLoading}
                              isPRMode={isPRMode}
                              isUnstaged={selection.isUnstaged}
                              showFullDiff={selection.showFullDiff}
                              comments={isPRMode ? prComments : []}
                              onPostComment={handlePostComment}
                            />
                          }
                        >
                          <ConflictViewer
                            activeDiff={selection.activeDiff}
                            loading={selection.diffLoading}
                          />
                        </Show>
                      )}
                    </Show>
                  </main>

                  <TerminalDock
                    open={terminalOpen}
                    height={terminalHeight}
                    onHeightChange={handleTerminalHeight}
                    projectPath={projectPath}
                    onRequestOpen={() => setTerminalOpen(true)}
                    onTabClosed={(layouts) => {
                      if (layouts.length === 0) {
                        setTerminalOpen(false);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            filename={pendingConfirmFile ?? ''}
            title={
              confirmKind === 'remove-worktree'
                ? 'Remove worktree?'
                : confirmKind === 'discard'
                ? (pendingUnstagedStatus === 'U'
                    ? 'Delete untracked file?'
                    : 'Discard changes?')
                : 'Stage conflicted file?'
            }
            message={
              confirmKind === 'remove-worktree' ? (
                <>
                  Remove worktree at <code>{pendingWorktreePath ?? ''}</code>?
                  Uncommitted changes will be lost.
                </>
              ) : confirmKind === 'discard' ? (
                pendingUnstagedStatus === 'U' ? (
                  <>
                    Permanently delete <code>{pendingConfirmFile ?? ''}</code>?
                    This cannot be undone.
                  </>
                ) : (
                  <>
                    Discard unstaged changes in <code>{pendingConfirmFile ?? ''}</code>?
                    This cannot be undone.
                  </>
                )
              ) : undefined
            }
            confirmLabel={
              confirmKind === 'remove-worktree'
                ? 'Remove'
                : confirmKind === 'discard'
                ? (pendingUnstagedStatus === 'U'
                    ? 'Delete'
                    : 'Discard')
                : 'Stage with markers'
            }
            onConfirm={handleConfirmDialog}
            onCancel={handleCancelConfirm}
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
            projectPath={projectPath}
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
