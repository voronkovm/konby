const test = require('node:test');
const assert = require('node:assert/strict');
const { githubRepoSlug } = require('../../lib/task_pr');

test('githubRepoSlug parses SSH remote URLs', () => {
  assert.equal(githubRepoSlug('git@github.com:owner/repo.git'), 'owner/repo');
  assert.equal(githubRepoSlug('git@github.com:owner/repo'), 'owner/repo');
  assert.equal(githubRepoSlug('git@github.com:org/sub/repo.git'), 'org/sub/repo');
});

test('githubRepoSlug parses HTTPS remote URLs', () => {
  assert.equal(githubRepoSlug('https://github.com/owner/repo.git'), 'owner/repo');
  assert.equal(githubRepoSlug('https://github.com/owner/repo'), 'owner/repo');
});

test('githubRepoSlug returns empty string for non-GitHub URLs', () => {
  assert.equal(githubRepoSlug('https://gitlab.com/owner/repo.git'), '');
  assert.equal(githubRepoSlug('git@bitbucket.org:owner/repo.git'), '');
  assert.equal(githubRepoSlug(''), '');
});

test('githubRepoSlug handles org with nested path', () => {
  assert.equal(githubRepoSlug('git@github.com:myorg/sub/repo.git'), 'myorg/sub/repo');
  assert.equal(githubRepoSlug('https://github.com/myorg/my-repo.git'), 'myorg/my-repo');
});
