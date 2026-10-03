// Heuristic quality check: Russian strings that still embed suspicious English words.
import fs from 'node:fs';
import path from 'node:path';

const source = JSON.parse(fs.readFileSync('work/i18n/dictionaries.json', 'utf8'));
const ruDir = 'work/i18n/ru';
const allow = new Set([
  'deepseek', 'harness', 'dsh', 'cordis', 'ptc', 'github', 'npm', 'pnpm', 'json', 'csv', 'url', 'api',
  'markdown', 'typescript', 'html', 'css', 'pdf', 'excel', 'word', 'shell', 'mcp', 'bash', 'pwsh',
  'grep', 'glob', 'http', 'https', 'ttft', 'utc', 'id', 'px', 'tab', 'enter', 'esc', 'ctrl', 'compact',
  'cron', 'openai', 'anthropic', 'chat', 'completions', 'responses', 'messages', 'run', 'code', 'sdk',
  'vscode', 'cursor', 'zed', 'windsurf', 'xcode', 'intellij', 'pycharm', 'webstorm', 'phpstorm', 'goland',
  'rider', 'rustrover', 'fork', 'sourcetree', 'tower', 'gitkraken', 'smartgit', 'sublime', 'merge',
  'ghostty', 'warp', 'iterm', 'kitty', 'gnome', 'konsole', 'finder', 'git', 'studio', 'android', 'text',
  'insiders', 'desktop', 'hugging', 'face', 'com', 'org', 'net', 'localhost', 'nodejs', 'javascript',
  'python', 'rust', 'go', 'java', 'kotlin', 'swift', 'linux', 'macos', 'windows', 'posix', 'utf', 'bom',
  'token', 'tokens', 'workflow', 'skills', 'skill', 'agent', 'agents', 'subagent', 'subagents', 'tool',
  'tools', 'session', 'sessions', 'goal', 'goals', 'plan', 'plans', 'feedback', 'permission', 'permissions',
  'export', 'import', 'compact', 'commit', 'branch', 'diff', 'log', 'logs', 'csv', 'url', 'uri', 'guid',
  'uuid', 'yaml', 'yml', 'toml', 'xml', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'mp4', 'wav',
  'exe', 'dll', 'zip', 'tar', 'gz', 'sh', 'ps1', 'bat', 'cmd', 'env', 'path', 'glob', 'regex', 'eof',
]);

const hits = [];
for (const file of fs.readdirSync(ruDir).filter((f) => f.endsWith('.json')).sort()) {
  const parsed = JSON.parse(fs.readFileSync(path.join(ruDir, file), 'utf8'));
  for (const [nsKey, dict] of Object.entries(parsed)) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string' || !/[А-Яа-яЁё]/.test(value)) continue;
      const stripped = value.replace(/\{[^}]*\}/g, ' ').replace(/`[^`]*`/g, ' ');
      const words = stripped.match(/[A-Za-z][A-Za-z'’-]{3,}/g) ?? [];
      const sus = words.filter((w) => !allow.has(w.toLowerCase()));
      if (sus.length) hits.push(`${nsKey}\t${key}\t${value.replace(/\n/g, '\\n')}\t[${sus.join(', ')}]`);
    }
  }
}
fs.writeFileSync('work/i18n/verify-english-left.tsv', hits.join('\n'));
console.log(`suspect strings: ${hits.length}`);
for (const h of hits.slice(0, 60)) console.log('  ' + h);
