function githubRepoSlug(remoteUrl) {
  let m;
  if ((m = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/))) return m[1].replace(/^\/+|\/+$/g, '');
  if ((m = remoteUrl.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/))) return m[1].replace(/^\/+|\/+$/g, '');
  return '';
}

module.exports = { githubRepoSlug };
