import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { useModel, useSignal } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import './app.css';
import { setupWailsEvents, api, watchFullscreen, getPlatform } from './wails.js';
import { WorkingTreeModel } from './models/workingTree.js';
import { SelectionModel } from './models/selection.js';
import { createNavigator, registerNavigator } from './models/navigation.js';
import { tabsStore as tabs, modeForSection } from './models/tabs.js';
import { bindTabsToSelection } from './models/tabsSelection.js';
import { SyncModel } from './models/sync.js';
import { WorktreeModel } from './models/worktree.js';
import { WorkspaceIndexModel } from './models/workspaceIndex.js';
import { ReviewModel } from './models/review.js';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { FileTree } from './components/FileTree.jsx';
import { EditorArea } from './components/tabs/EditorArea.jsx';
import { closeActiveTab } from './components/tabs/useTabShortcuts.js';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { ToastContainer } from './components/ToastContainer.jsx';
import { PreferencesPage } from './components/PreferencesPage.jsx';
import { ProjectPicker } from './components/ProjectPicker.jsx';
import { PRCheckoutPrompt } from './components/PRCheckoutPrompt.jsx';
import { CreatePRModal } from './components/CreatePRModal.jsx';
import { TerminalDock, isTerminalFocusTarget } from './components/terminal/TerminalDock.jsx';
import { setTerminalScope, removeTerminalScope } from './components/terminal/terminalStore.js';
import { SidebarActions } from './components/SidebarActions.jsx';
import { IslandHeader } from './components/IslandHeader.jsx';
import { WorktreesPanel } from './components/WorktreesPanel.jsx';
import { CommandPalette } from './components/palette/CommandPalette.jsx';
import { HomeScreen } from './components/home/HomeScreen.jsx';

/** Stable empty list so FileTree does not remount on unrelated App re-renders. */
const EMPTY_FILES = [];

export function App() {
  const [activePR, setActivePR] = useState(null);
  const [branches, setBranches] = useState({ current: 'main', local: [], remote: [] });
  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** @type {['stage-conflict' | 'discard' | 'discard-all' | 'remove-worktree' | null, function]} */
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
  // Platform state — resolved via the Wails runtime API (GOOS: darwin/linux/windows)
  const [platform, setPlatform] = useState('unknown');
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const isMacOS = platform === 'darwin';
  const isLinux = platform === 'linux';

  // GitHub / PR state
  const [ghStatus, setGhStatus] = useState({ installed: false, version: '', user: '' });
  const [prList, setPrList] = useState([]);
  const [prComments, setPrComments] = useState([]);
  const [prChecksSummary, setPrChecksSummary] = useState(null);
  const [ciNotifyMode, setCiNotifyMode] = useState(/** @type {'off' | 'all' | 'workflow'} */ ('off'));
  const [prPrompt, setPrPrompt] = useState(null);
  const [prCheckoutPending, setPrCheckoutPending] = useState(/** @type {null | 'local' | 'worktree'} */ (null));
  // Create PR modal
  const [createPROpen, setCreatePROpen] = useState(false);

  // Home screen (full-size workspace index). Shown at launch when no project is open.
  const homeOpen = useSignal(false);

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
    const value = next instanceof Function ? next(activePRSignal.peek()) : next;
    activePRSignal.value = value;
    setActivePR(value);
  }, [activePRSignal]);

  const workingTree = useModel(() => new WorkingTreeModel({
    onError: (title, message) => {
      setToasts((prev) => [...prev, { id: Date.now().toString(), title, message }]);
    },
  }));

  const worktree = useModel(() => new WorktreeModel({
    onError: (title, message) => {
      setToasts((prev) => [...prev, { id: Date.now().toString(), title, message }]);
    },
  }));

  const workspaceIndex = useModel(() => new WorkspaceIndexModel({
    onError: (title, message) => {
      setToasts((prev) => [...prev, { id: Date.now().toString(), title, message }]);
    },
  }));

  const review = useModel(() => new ReviewModel({
    onError: (title, message) => {
      setToasts((prev) => [...prev, { id: Date.now().toString(), title, message }]);
    },
  }));
  const reviewRef = useRef(review);

  const selection = useModel(() => new SelectionModel({
    workingTree,
    activePR: activePRSignal,
  }));

  // Models / PR bridge are stable for App lifetime; keep refs for the mount-once event effect.
  const workingTreeRef = useRef(workingTree);
  const worktreeRef = useRef(worktree);
  const selectionRef = useRef(selection);
  const workspaceIndexRef = useRef(workspaceIndex);
  const activePRSignalRef = useRef(activePRSignal);
  workingTreeRef.current = workingTree;
  worktreeRef.current = worktree;
  selectionRef.current = selection;
  workspaceIndexRef.current = workspaceIndex;
  activePRSignalRef.current = activePRSignal;

  const activePRRef = useRef(activePR);
  const prCheckoutPendingRef = useRef(prCheckoutPending);
  useEffect(() => { activePRRef.current = activePR; }, [activePR]);
  useEffect(() => { prCheckoutPendingRef.current = prCheckoutPending; }, [prCheckoutPending]);

  const isPRMode = activePR != null;
  const currentPR = isPRMode ? prList.find((p) => p.number === activePR) : null;

  // Terminal links (and future palette/search) open files through the navigation seam.
  const currentPRFilesRef = useRef(EMPTY_FILES);
  currentPRFilesRef.current = currentPR?.files ?? EMPTY_FILES;
  useEffect(
    () =>
      registerNavigator(
        createNavigator({
          tabs,
          workingTree,
          activePR: activePRSignal,
          isPRFile: (path) => currentPRFilesRef.current.some((f) => f.path === path),
        })
      ),
    [activePRSignal, workingTree]
  );

  // The active diff tab drives the selection model (diff fetching + shared viewers).
  useEffect(() => bindTabsToSelection({ tabs, selection }), [selection]);

  // Setup Wails events
  useEffect(() => {
    setupWailsEvents({
      onFileStatusChanged: (data) => {
        const wt = workingTreeRef.current;
        wt.applyStatus(data);

        // First file of a fresh worktree opens as a preview diff tab (once per worktree).
        if (tabs.canSeed() && activePRSignalRef.current.peek() == null) {
          const first = wt.firstEntry();

          if (first) {
            tabs.markSeeded();
            tabs.open({ kind: 'diff', path: first.path, mode: modeForSection(first.section), preview: true });
          }
        }
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
      onPRChecksUpdated: (data) => {
        if (activePRRef.current == null || data?.number !== activePRRef.current) return;
        setPrChecksSummary(data);
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

        if (activePRSignalRef.current.peek() === number) {
          reviewRef.current.load(number);
        }

        if (
          activePRSignalRef.current.peek() === number &&
          !tabs.hasTabs.peek() &&
          files.length > 0
        ) {
          tabs.open({ kind: 'diff', path: files[0].path, mode: 'pr', preview: true });
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
        setPrCheckoutPending(null);
        setPrPrompt(null);
      },
      onPRCreated: () => {
        setCreatePROpen(false);
      },
      onError: (data) => {
        selectionRef.current.diffLoading.value = false;

        if (prCheckoutPendingRef.current) {
          setPrCheckoutPending(null);
        }

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
        worktreeRef.current.setCurrentPath(data.path ?? '');
        selectionRef.current.clear();
        tabs.setScope(data.path ?? '');
        // PR-diff tabs only make sense while a PR is being reviewed.
        tabs.closeWhere((t) => t.kind === 'diff' && t.mode === 'pr');
        activePRSignalRef.current.value = null;
        setActivePR(null);
        setPrChecksSummary(null);
        api.stopPRChecksMonitor();
        setTerminalScope(data.path ?? '');

        if (data.path) homeOpen.value = false;
      },
      onRecentProjectsUpdated: (data) => {
        setRecentProjects(data.projects ?? []);
      },
      onWorktreesUpdated: (data) => {
        worktreeRef.current.applyWorktrees(data);
      },
      onWorkspaceIndexUpdated: (data) => {
        workspaceIndexRef.current.applyIndex(data);
      },
      onMenuCloseTab: () => {
        closeActiveTab(tabs);
      },
      onRefreshCompleted: () => {
        selectionRef.current.refetch();
      },
    });
  }, [sync, homeOpen]);

  // Resolve platform via the Wails runtime (GOOS)
  useEffect(() => {
    let cancelled = false;
    getPlatform().then((platform) => {
      if (!cancelled) setPlatform(platform);
    });

    return () => {
      cancelled = true;
    };
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

  // Cmd/Ctrl+Shift+H toggles the home screen. Capture phase so the terminal cannot swallow it.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'h' && e.key !== 'H') return;

      if (!e.shiftKey || e.altKey) return;
      const mod = isMacOS ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;

      if (!mod) return;
      e.preventDefault();
      e.stopPropagation();
      homeOpen.value = !homeOpen.peek();
    }

    document.addEventListener('keydown', onKey, true);

    return () => document.removeEventListener('keydown', onKey, true);
  }, [isMacOS, homeOpen]);

  // Ctrl+R refresh on Linux/Windows. macOS keeps the View → Reload menu accel
  // (Cmd+R). Skip the terminal so readline reverse-i-search still works.
  useEffect(() => {
    if (platform !== 'linux' && platform !== 'windows') return;

    function onKey(e) {
      if (e.key !== 'r' && e.key !== 'R') return;

      if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      if (isTerminalFocusTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      api.refresh();
    }

    document.addEventListener('keydown', onKey, true);

    return () => document.removeEventListener('keydown', onKey, true);
  }, [platform]);

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

      if (prefs?.terminalOpen === true || prefs?.terminalOpen === false) {
        setTerminalOpen(prefs.terminalOpen);
      }

      terminalPrefsReady.current = true;
    });
    api.getCIPrefs().then((prefs) => {
      const mode = prefs?.mode;

      if (mode === 'off' || mode === 'all' || mode === 'workflow') {
        setCiNotifyMode(mode);
      }
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
      if (proj?.path) {
        setProjectName(proj.name ?? '');
        setProjectPath(proj.path ?? '');
        worktreeRef.current.setCurrentPath(proj.path ?? '');
        setTerminalScope(proj.path ?? '');
        tabs.setScope(proj.path ?? '');
      } else {
        homeOpen.value = true;
      }
    });
    api.getRecentProjects().then((list) => {
      setRecentProjects(list ?? []);
    });
  }, [homeOpen]);

  // macOS titlebar: watch fullscreen state once we know we're on macOS
  useEffect(() => {
    if (!isMacOS) return;

    const cleanup = watchFullscreen((fullscreen) => {
      setIsFullscreenMode(fullscreen);
    }, 500);

    return () => cleanup();
  }, [isMacOS]);

  // Fetch PR comments (and persisted pending-review drafts) when active PR changes
  useEffect(() => {
    if (isPRMode && activePR != null) {
      api.getPRComments(activePR);
      review.load(activePR);
    } else {
      setPrComments([]);
      review.load(null);
    }
  }, [isPRMode, activePR, projectPath, review]);

  // Poll CI checks while a PR is open in review mode
  useEffect(() => {
    if (!isPRMode || activePR == null) {
      setPrChecksSummary(null);
      api.stopPRChecksMonitor();

      return;
    }

    setPrChecksSummary(null);
    api.startPRChecksMonitor(activePR);

    return () => {
      api.stopPRChecksMonitor();
    };
  }, [isPRMode, activePR]);

  const handleSelectPR = useCallback((pr) => {
    if (pr) {
      setPrList((prev) =>
        prev.some((p) => p.number === pr.number) ? prev : [...prev, pr]
      );
      setPrPrompt(pr);
    } else {
      setActivePRBoth(null);
      tabs.closeWhere((t) => t.kind === 'diff' && t.mode === 'pr');
      const first = workingTree.firstEntry();

      if (first) {
        tabs.open({ kind: 'diff', path: first.path, mode: modeForSection(first.section), preview: true });
      }
    }
  }, [workingTree, setActivePRBoth]);

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
    tabs.closeWhere((t) => t.kind === 'diff' && t.mode !== 'pr');
    selection.clear();
    setActivePRBoth(pr.number);
    api.getPRFiles(pr.number);
  }, [selection, setActivePRBoth]);

  const handleCheckoutPRLocal = useCallback((pr) => {
    setPrCheckoutPending('local');
    api.checkoutPR(pr.number).catch(() => {
      setPrCheckoutPending(null);
    });
  }, []);

  const handleCheckoutPRWorktree = useCallback((pr, hash) => {
    setPrCheckoutPending('worktree');
    api.checkoutPRToWorktree(pr.number, hash).catch(() => {
      setPrCheckoutPending(null);
    });
  }, []);

  const handleSelectBranch = useCallback((branch) => {
    if (branch) {
      api.switchBranch(branch);
    }

    if (isPRMode) {
      setActivePRBoth(null);
      tabs.closeWhere((t) => t.kind === 'diff' && t.mode === 'pr');
      selection.clear();
    }
  }, [isPRMode, selection, setActivePRBoth]);

  // Left-list click: preview diff tab; double click (pin) keeps it.
  const handleOpenDiff = useCallback((path, section, opts) => {
    tabs.open({ kind: 'diff', path, mode: modeForSection(section), preview: !opts?.pin });
  }, []);

  const handleEditFile = useCallback((path) => {
    tabs.open({ kind: 'file', path, preview: false });
  }, []);

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

  const handleDiscardAll = useCallback(() => {
    setConfirmKind('discard-all');
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
      // Kill terminals scoped to the removed worktree before the dir goes away.
      tabs.removeScope(worktreePath);
      removeTerminalScope(worktreePath).forEach((sessionId) => {
        api.terminalStop(sessionId).catch(() => {});
      });
      // Go re-emits the workspace index after a successful removal.
      worktree.remove(worktreePath);

      return;
    }

    if (kind === 'stage-conflict') {
      if (!path) return;
      workingTree.stage(path);

      return;
    }

    if (kind === 'discard') {
      if (!path) return;
      workingTree.discard(path);

      return;
    }

    if (kind === 'discard-all') {
      workingTree.discardAll();
    }
  }, [pendingConfirmFile, pendingWorktreePath, confirmKind, workingTree, worktree]);

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
    isLinux ? 'linux' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const pendingUnstagedStatus = pendingConfirmFile
    ? workingTree.unstaged.peek().find((f) => f.path === pendingConfirmFile)?.status
    : undefined;

  return (
    <ThemeProvider>
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
                  worktree={worktree}
                  onSwitch={handleSwitchProject}
                  onRemove={handleRemoveWorktree}
                />

                <FileTree
                  workingTree={workingTree}
                  activeTab={tabs.activeTab}
                  onOpenDiff={handleOpenDiff}
                  onEditFile={handleEditFile}
                  prFiles={isPRMode ? (currentPR?.files ?? EMPTY_FILES) : EMPTY_FILES}
                  isPRMode={isPRMode}
                  currentBranch={branches.current}
                  onStage={handleStage}
                  onUnstage={(path) => workingTree.unstage(path)}
                  onDiscard={handleDiscard}
                  onStageAll={() => workingTree.stageAll()}
                  onUnstageAll={() => workingTree.unstageAll()}
                  onDiscardAll={handleDiscardAll}
                  onCommit={(message) => workingTree.commit(message)}
                />
              </aside>

              <div class="content-well">
                <div class="content">
                  <main class="app-main">
                    <IslandHeader
                      sidebarOpen={sidebarOpen}
                      onToggleSidebar={() => setSidebarOpen((open) => !open)}
                      tabs={tabs}
                      projectPath={projectPath}
                      isPRMode={isPRMode}
                      showFullDiff={selection.showFullDiff}
                      onToggleShowFullDiff={() => selection.toggleShowFullDiff()}
                      selectedPR={activePR}
                      currentPR={currentPR}
                      onShowHome={() => { homeOpen.value = true; }}
                      onSelectPR={handleSelectPR}
                      onError={pushToast}
                      onCreatePR={() => setCreatePROpen(true)}
                      showCIMonitor={isPRMode}
                      prChecksSummary={prChecksSummary}
                      review={review}
                    />
                    <EditorArea
                      tabs={tabs}
                      selection={selection}
                      isPRMode={isPRMode}
                      isMac={isMacOS}
                      prComments={prComments}
                      onPostComment={handlePostComment}
                      review={review}
                      onError={pushToast}
                    />
                  </main>

                  <TerminalDock
                    open={terminalOpen}
                    height={terminalHeight}
                    onHeightChange={handleTerminalHeight}
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

            <Show when={homeOpen}>
              {() => (
                <HomeScreen
                  index={workspaceIndex}
                  ghStatus={ghStatus}
                  onClose={projectPath ? () => { homeOpen.value = false; } : null}
                  onRemoveWorktree={handleRemoveWorktree}
                  onOpenProject={handleOpenProject}
                />
              )}
            </Show>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            filename={pendingConfirmFile ?? ''}
            title={
              confirmKind === 'remove-worktree'
                ? 'Remove worktree?'
                : confirmKind === 'discard-all'
                ? 'Revert all changes?'
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
              ) : confirmKind === 'discard-all' ? (
                <>Revert all unstaged changes? Untracked files will be permanently deleted.</>
              ) : undefined
            }
            confirmLabel={
              confirmKind === 'remove-worktree'
                ? 'Remove'
                : confirmKind === 'discard-all'
                ? 'Revert All'
                : confirmKind === 'discard'
                ? (pendingUnstagedStatus === 'U'
                    ? 'Delete'
                    : 'Discard')
                : 'Stage with markers'
            }
            onConfirm={handleConfirmDialog}
            onCancel={handleCancelConfirm}
          />

          <CommandPalette index={workspaceIndex} onHome={() => { homeOpen.value = true; }} />

          <ToastContainer
            toasts={toasts}
            onDismiss={dismissToast}
          />

          <PreferencesPage
            open={preferencesOpen}
            onClose={() => setPreferencesOpen(false)}
            ghStatus={ghStatus}
            onRefreshGH={() => api.detectGH()}
            ciNotifyMode={ciNotifyMode}
            onCINotifyModeChange={setCiNotifyMode}
          />

          <CreatePRModal
            open={createPROpen}
            onClose={() => setCreatePROpen(false)}
            baseBranches={branches.local}
            onSubmit={handleCreatePR}
          />

          <PRCheckoutPrompt
            pr={prPrompt}
            worktree={worktree}
            checkoutPending={prCheckoutPending}
            onViewDiff={() => handleViewPRDiff(prPrompt)}
            onCheckoutLocal={() => handleCheckoutPRLocal(prPrompt)}
            onCheckoutWorktree={(hash) => handleCheckoutPRWorktree(prPrompt, hash)}
            onClose={() => setPrPrompt(null)}
          />
        </div>
    </ThemeProvider>
  );
}
