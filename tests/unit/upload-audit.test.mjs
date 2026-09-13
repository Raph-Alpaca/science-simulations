import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT } from '../../automation/catalog/content.mjs';

async function repository(t) {
  const parent = path.resolve(ROOT, '.local/upload-audit-tests');
  await fs.mkdir(parent, { recursive: true });
  const dir = await fs.mkdtemp(path.join(parent, 'repo-'));
  t.after(async () => {
    // Delete only the unique temporary repository created by this test.
    assert.equal(path.dirname(path.resolve(dir)), parent);
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(dir, 'automation/catalog'), { recursive: true });
  for (const file of ['audit-upload.mjs', 'content.mjs']) {
    await fs.copyFile(path.join(ROOT, 'automation/catalog', file), path.join(dir, 'automation/catalog', file));
  }
  await fs.writeFile(path.join(dir, '.gitignore'), '.local/\n');
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--initial-branch=audit-fixture');
  git('add', '--', '.gitignore', 'automation/catalog/audit-upload.mjs', 'automation/catalog/content.mjs');
  git('-c', 'user.name=Audit Test', '-c', 'user.email=audit@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-m', 'test fixture');
  const commit = git('rev-parse', 'HEAD');
  const run = () => spawnSync(process.execPath, ['automation/catalog/audit-upload.mjs'], { cwd: dir, encoding: 'utf8', timeout: 15000 });
  const report = async () => JSON.parse(await fs.readFile(path.join(dir, '.local/evidence/pages04/upload-audit.json'), 'utf8'));
  return { dir, git, commit, run, report };
}

for (const detached of [false, true]) {
  test(`upload audit in ${detached ? 'detached HEAD' : 'named branch'} records SHA and still rejects forbidden data`, async t => {
    const repo = await repository(t);
    if (detached) repo.git('checkout', '--detach', repo.commit);
    const result = repo.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const report = await repo.report();
    assert.equal(report.branch, detached ? null : 'audit-fixture');
    assert.equal(report.headState, detached ? 'detached' : 'branch');
    assert.equal(report.commit, repo.commit);
    assert.equal(JSON.parse(result.stdout).commit, repo.commit);
    assert.deepEqual(report.problems, []);

    // Synthetic values only, built at runtime; never actual credentials or source PDFs.
    const token = 'ghp_' + 'x'.repeat(36);
    await fs.writeFile(path.join(repo.dir, '.env'), `TOKEN=${token}\n`);
    await fs.writeFile(path.join(repo.dir, 'private.pdf'), 'synthetic forbidden extension fixture');
    await fs.writeFile(path.join(repo.dir, '.local/private.txt'), 'synthetic private note');
    repo.git('add', '-f', '--', '.local/private.txt');
    const rejected = repo.run();
    assert.equal(rejected.status, 1);
    const problems = (await repo.report()).problems;
    for (const file of ['.env', 'private.pdf', '.local/private.txt']) {
      assert.ok(problems.some(p => p.path === file && p.type === 'private-or-generated-path'));
    }
    assert.ok(problems.some(p => p.path === '.env' && p.type === 'github-token'));
    assert.equal((rejected.stdout + rejected.stderr).includes(token), false);
  });
}

test('upload audit fails on invalid Git metadata rather than reporting detached success', async t => {
  const repo = await repository(t);
  await fs.writeFile(path.join(repo.dir, '.git/HEAD'), 'invalid HEAD\n');
  const result = repo.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fatal:/);
  await assert.rejects(repo.report(), { code: 'ENOENT' });
});
