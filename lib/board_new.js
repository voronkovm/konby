const fs = require('fs');
const path = require('path');

function setWorkspaceDefaultContent(content, workspacePath) {
  const lines = String(content || '').split(/\r?\n/);
  const out = [];
  let inWs = false;
  let wsIndent = -1;
  let wroteDefault = false;

  for (const line of lines) {
    const wsMatch = line.match(/^(\s*)workspace:\s*$/);
    if (wsMatch && !inWs) {
      wsIndent = wsMatch[1].length;
      inWs = true;
      out.push(line);
      continue;
    }

    if (inWs) {
      if (/^\s*$/.test(line)) {
        out.push(line);
        continue;
      }
      const indent = line.match(/^\s*/)[0].length;
      if (indent <= wsIndent) {
        if (!wroteDefault) {
          out.push(`    default: "${workspacePath}"`);
          wroteDefault = true;
        }
        inWs = false;
        out.push(line);
        continue;
      }
      if (/^\s*default:/.test(line)) {
        out.push(`    default: "${workspacePath}"`);
        wroteDefault = true;
        continue;
      }
    }

    out.push(line);
  }

  if (inWs && !wroteDefault) {
    out.push(`    default: "${workspacePath}"`);
  }

  return out.join('\n');
}

function createFileIfMissing(src, dst, force) {
  if (fs.existsSync(dst) && !force) {
    process.stdout.write(`Skip existing file: ${dst}\n`);
    return;
  }
  fs.copyFileSync(src, dst);
  process.stdout.write(`Created: ${dst}\n`);
}

function copyPresetTree(srcRoot, dstRoot, force) {
  function walk(dir, rel) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const srcPath = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const dstPath = path.join(dstRoot, relPath);
      if (entry.isDirectory()) {
        fs.mkdirSync(dstPath, { recursive: true });
        walk(srcPath, relPath);
      } else if (entry.isFile()) {
        createFileIfMissing(srcPath, dstPath, force);
      }
    }
  }
  walk(srcRoot, '');
}

module.exports = { copyPresetTree, createFileIfMissing, setWorkspaceDefaultContent };
