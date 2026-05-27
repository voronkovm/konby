const path = require('path');
const { sanitizePathToken } = require('./dispatch');

function transcriptPathForSession(projectDir, taskFile, sessionId) {
  const taskSlug = sanitizePathToken(path.basename(taskFile).replace(/\.ya?ml$/i, ''), 'task');
  const rawSessionSlug = sanitizePathToken(sessionId || 'session', 'session');
  const legacyTaskToken = `___${taskSlug}__`;
  const taskToken = `__${taskSlug}__`;
  let sessionSlug = rawSessionSlug;
  if (rawSessionSlug.includes(taskToken)) {
    sessionSlug = rawSessionSlug.replace(taskToken, '__');
  } else if (rawSessionSlug.includes(legacyTaskToken)) {
    sessionSlug = rawSessionSlug.replace(legacyTaskToken, '__');
  }
  return path.join(projectDir, 'transcripts', taskSlug, `${sessionSlug}.txt`);
}

module.exports = { transcriptPathForSession };
