/**
 * Minimal glob → RegExp conversion. Supports `**`, `*`, `?` and `{a,b}`.
 * Patterns are matched against POSIX repo-relative paths.
 */
export function globToRegExp(pattern: string): RegExp {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // "**/" matches zero or more directories; trailing "**" matches everything
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
        i += 1;
      } else {
        const alts = pattern.slice(i + 1, end).split(',').map(escapeRegExp);
        re += `(?:${alts.join('|')})`;
        i = end + 1;
      }
    } else {
      re += escapeRegExp(c);
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchGlob(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}
