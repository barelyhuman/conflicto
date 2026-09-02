export namespace main {
	
	export class PRFileViewedState {
	    path: string;
	    viewerViewedState: string;
	
	    static createFrom(source: any = {}) {
	        return new PRFileViewedState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.viewerViewedState = source["viewerViewedState"];
	    }
	}
	export class PRReviewState {
	    number: number;
	    pullRequestId: string;
	    reviewDecision: string;
	    viewerReviewState: string;
	    viewerReviewSubmittedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new PRReviewState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.pullRequestId = source["pullRequestId"];
	        this.reviewDecision = source["reviewDecision"];
	        this.viewerReviewState = source["viewerReviewState"];
	        this.viewerReviewSubmittedAt = source["viewerReviewSubmittedAt"];
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

}

