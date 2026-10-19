export namespace main {
	
	export class ConflictFile {
	    worktree: string;
	    hasWorktree: boolean;
	    ours: string;
	    hasOurs: boolean;
	    theirs: string;
	    hasTheirs: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConflictFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.worktree = source["worktree"];
	        this.hasWorktree = source["hasWorktree"];
	        this.ours = source["ours"];
	        this.hasOurs = source["hasOurs"];
	        this.theirs = source["theirs"];
	        this.hasTheirs = source["hasTheirs"];
	    }
	}
	export class FileContentsResult {
	    oldContent: string;
	    newContent: string;
	    hasOld: boolean;
	    hasNew: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileContentsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.oldContent = source["oldContent"];
	        this.newContent = source["newContent"];
	        this.hasOld = source["hasOld"];
	        this.hasNew = source["hasNew"];
	    }
	}
	export class FileDiff {
	    path: string;
	    patch: string;
	
	    static createFrom(source: any = {}) {
	        return new FileDiff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.patch = source["patch"];
	    }
	}
	export class LSPServerInfo {
	    id: string;
	    languages: string[];
	    command: string;
	    available: boolean;
	    status: string;
	    error: string;
	    rootUri: string;
	
	    static createFrom(source: any = {}) {
	        return new LSPServerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.languages = source["languages"];
	        this.command = source["command"];
	        this.available = source["available"];
	        this.status = source["status"];
	        this.error = source["error"];
	        this.rootUri = source["rootUri"];
	    }
	}
	export class PRCheck {
	    name: string;
	    state: string;
	    bucket: string;
	    workflow: string;
	    link: string;
	
	    static createFrom(source: any = {}) {
	        return new PRCheck(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.state = source["state"];
	        this.bucket = source["bucket"];
	        this.workflow = source["workflow"];
	        this.link = source["link"];
	    }
	}
	export class PRChecksSummary {
	    number: number;
	    status: string;
	    pending: number;
	    pass: number;
	    fail: number;
	    total: number;
	    checks: PRCheck[];
	
	    static createFrom(source: any = {}) {
	        return new PRChecksSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.status = source["status"];
	        this.pending = source["pending"];
	        this.pass = source["pass"];
	        this.fail = source["fail"];
	        this.total = source["total"];
	        this.checks = this.convertValues(source["checks"], PRCheck);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PRDetails {
	    number: number;
	    title: string;
	    body: string;
	    author: string;
	    state: string;
	    isDraft: boolean;
	    url: string;
	    baseRef: string;
	    headRef: string;
	    headSha: string;
	    additions: number;
	    deletions: number;
	    changedFiles: number;
	    reviewDecision: string;
	    createdAt: string;
	    updatedAt: string;
	    checks?: PRChecksSummary;
	    worktreePath: string;
	
	    static createFrom(source: any = {}) {
	        return new PRDetails(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.title = source["title"];
	        this.body = source["body"];
	        this.author = source["author"];
	        this.state = source["state"];
	        this.isDraft = source["isDraft"];
	        this.url = source["url"];
	        this.baseRef = source["baseRef"];
	        this.headRef = source["headRef"];
	        this.headSha = source["headSha"];
	        this.additions = source["additions"];
	        this.deletions = source["deletions"];
	        this.changedFiles = source["changedFiles"];
	        this.reviewDecision = source["reviewDecision"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.checks = this.convertValues(source["checks"], PRChecksSummary);
	        this.worktreePath = source["worktreePath"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PRFile {
	    path: string;
	    status: string;
	    additions: number;
	    deletions: number;
	    patch: string;
	
	    static createFrom(source: any = {}) {
	        return new PRFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.status = source["status"];
	        this.additions = source["additions"];
	        this.deletions = source["deletions"];
	        this.patch = source["patch"];
	    }
	}
	export class PRSummary {
	    number: number;
	    title: string;
	    author: string;
	    state: string;
	    isDraft: boolean;
	    headRef: string;
	    updatedAt: string;
	    worktreePath: string;
	
	    static createFrom(source: any = {}) {
	        return new PRSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.state = source["state"];
	        this.isDraft = source["isDraft"];
	        this.headRef = source["headRef"];
	        this.updatedAt = source["updatedAt"];
	        this.worktreePath = source["worktreePath"];
	    }
	}
	export class PRTimelineItem {
	    kind: string;
	    author: string;
	    body: string;
	    createdAt: string;
	    state: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new PRTimelineItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.author = source["author"];
	        this.body = source["body"];
	        this.createdAt = source["createdAt"];
	        this.state = source["state"];
	        this.url = source["url"];
	    }
	}
	export class ProjectAvailability {
	    path: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectAvailability(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.status = source["status"];
	    }
	}
	export class RecentProject {
	    path: string;
	    name: string;
	    // Go type: time
	    openedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new RecentProject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.openedAt = this.convertValues(source["openedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReviewDraft {
	    id: string;
	    path: string;
	    body: string;
	    line: number;
	    side: string;
	    startLine?: number;
	    startSide?: string;
	    headSHA?: string;
	    createdAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new ReviewDraft(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.body = source["body"];
	        this.line = source["line"];
	        this.side = source["side"];
	        this.startLine = source["startLine"];
	        this.startSide = source["startSide"];
	        this.headSHA = source["headSHA"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ReviewFile {
	    path: string;
	    patch: string;
	
	    static createFrom(source: any = {}) {
	        return new ReviewFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.patch = source["patch"];
	    }
	}
	export class ReviewState {
	    drafts: ReviewDraft[];
	    headSHA: string;
	    files: ReviewFile[];
	
	    static createFrom(source: any = {}) {
	        return new ReviewState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.drafts = this.convertValues(source["drafts"], ReviewDraft);
	        this.headSHA = source["headSHA"];
	        this.files = this.convertValues(source["files"], ReviewFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SearchMatch {
	    path: string;
	    line: number;
	    col: number;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new SearchMatch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.line = source["line"];
	        this.col = source["col"];
	        this.text = source["text"];
	    }
	}
	export class SearchOpts {
	    query: string;
	    regex: boolean;
	    caseSensitive: boolean;
	    wholeWord: boolean;
	    glob: string;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new SearchOpts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.query = source["query"];
	        this.regex = source["regex"];
	        this.caseSensitive = source["caseSensitive"];
	        this.wholeWord = source["wholeWord"];
	        this.glob = source["glob"];
	        this.limit = source["limit"];
	    }
	}
	export class TerminalStartOpts {
	    cwd: string;
	    cols: number;
	    rows: number;
	    cmd: string;
	    args: string[];
	
	    static createFrom(source: any = {}) {
	        return new TerminalStartOpts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cwd = source["cwd"];
	        this.cols = source["cols"];
	        this.rows = source["rows"];
	        this.cmd = source["cmd"];
	        this.args = source["args"];
	    }
	}
	export class TerminalStartResult {
	    id: string;
	    cwd: string;
	
	    static createFrom(source: any = {}) {
	        return new TerminalStartResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.cwd = source["cwd"];
	    }
	}
	export class WorkspaceEntry {
	    kind: string;
	    id: string;
	    title: string;
	    subtitle: string;
	    repoPath: string;
	    repoName: string;
	    path: string;
	    prNumber: number;
	    prState: string;
	    branch: string;
	    hasWorktree: boolean;
	    stale: boolean;
	    active: boolean;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.id = source["id"];
	        this.title = source["title"];
	        this.subtitle = source["subtitle"];
	        this.repoPath = source["repoPath"];
	        this.repoName = source["repoName"];
	        this.path = source["path"];
	        this.prNumber = source["prNumber"];
	        this.prState = source["prState"];
	        this.branch = source["branch"];
	        this.hasWorktree = source["hasWorktree"];
	        this.stale = source["stale"];
	        this.active = source["active"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class WorktreeInfo {
	    path: string;
	    branch: string;
	    head: string;
	    isMain: boolean;
	    isCurrent: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WorktreeInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.branch = source["branch"];
	        this.head = source["head"];
	        this.isMain = source["isMain"];
	        this.isCurrent = source["isCurrent"];
	    }
	}
	export class WorktreePathPreview {
	    path: string;
	    hash: string;
	
	    static createFrom(source: any = {}) {
	        return new WorktreePathPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.hash = source["hash"];
	    }
	}

}

