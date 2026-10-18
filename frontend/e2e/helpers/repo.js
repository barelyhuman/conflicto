import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Creates a throwaway git repo with one commit on `main`. Always under the OS temp dir. */
export function createRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'conflicto-e2e-')));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'E2E');
  git(dir, 'config', 'user.email', 'e2e@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'README.md'), '# fixture\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'initial');
  return {
    dir,
    write: (name, content) => writeFileSync(join(dir, name), content),
    git: (...args) => git(dir, ...args),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
