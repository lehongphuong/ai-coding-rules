import { describe, expect, it } from 'vitest';
import { cleanVersion, inferKind, parseJsonc } from '../../src/scanner/util.js';
import { parseEditorConfigIndent } from '../../src/scanner/detectors/tooling.js';

describe('parseJsonc', () => {
  it('strips comments and trailing commas', () => {
    const text = `{
      // line comment
      "a": "http://x.y/*not a comment*/", /* block */
      "b": [1, 2, ],
    }`;
    expect(parseJsonc(text)).toEqual({ a: 'http://x.y/*not a comment*/', b: [1, 2] });
  });
  it('keeps escaped quotes and returns undefined on garbage', () => {
    expect(parseJsonc('{"a": "x\\"//y"}')).toEqual({ a: 'x"//y' });
    expect(parseJsonc('{ nope')).toBeUndefined();
  });
});

describe('inferKind', () => {
  it('maps script names to command kinds', () => {
    expect(inferKind('test')).toBe('test');
    expect(inferKind('test:unit')).toBe('test');
    expect(inferKind('test:e2e')).toBe('e2e');
    expect(inferKind('e2e')).toBe('e2e');
    expect(inferKind('fmt')).toBe('format');
    expect(inferKind('type-check')).toBe('typecheck');
    expect(inferKind('tsc')).toBe('typecheck');
    expect(inferKind('start')).toBe('dev');
    expect(inferKind('db:migrate')).toBe('migrate');
    expect(inferKind('generate')).toBe('codegen');
    expect(inferKind('preview')).toBeUndefined();
  });
});

describe('cleanVersion', () => {
  it('strips range operators', () => {
    expect(cleanVersion('^10.2.0')).toBe('10.2.0');
    expect(cleanVersion('~5')).toBe('5');
    expect(cleanVersion('latest')).toBeUndefined();
  });
});

describe('parseEditorConfigIndent', () => {
  it('reads the [*] section only', () => {
    expect(parseEditorConfigIndent('[*]\nindent_style = space\nindent_size = 4\n')?.value).toBe(
      '4',
    );
    expect(parseEditorConfigIndent('[*.md]\nindent_size = 4\n')).toBeUndefined();
    expect(parseEditorConfigIndent('root = true\n[*]\nindent_style = tab\n')).toEqual({
      value: 'tab',
      line: 3,
    });
  });
});
