function parseDispatchdArgs(argv) {
  const out = { board: '', logFile: '', daemon: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--board' || t === '--dir') {
      if (!argv[i + 1]) throw new Error(`${t} requires a value`);
      out.board = argv[++i];
    } else if (t === '--log-file') {
      if (!argv[i + 1]) throw new Error('--log-file requires a value');
      out.logFile = argv[++i];
    } else if (t === '--daemon') {
      out.daemon = true;
    } else if (t === '--help' || t === '-h') {
      out.help = true;
      return out;
    } else {
      throw new Error(`Unknown argument: ${t}`);
    }
  }
  return out;
}

module.exports = { parseDispatchdArgs };
