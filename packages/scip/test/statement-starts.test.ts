import { describe, expect, it } from 'vitest';
import { statementStarts } from '../src/reader.js';

// Review round-3 HIGH-1: statement starts must follow Python's line joining (Language Reference 2.1.5/2.1.6),
// ignoring brackets inside comments and strings.
describe('statementStarts (Python line joining)', () => {
  it('ignores an unbalanced bracket in a trailing comment', () => {
    expect(statementStarts(['from . import a  # (oops', 'from .. import b'])).toEqual([0, 1]);
  });
  it('ignores brackets inside single-line and triple-quoted strings', () => {
    expect(statementStarts(['s = "a ( b"', "t = '[x'", '"""doc (', 'still doc', '"""', 'from . import c'])).toEqual([0, 1, 2, 2, 2, 5]);
  });
  it('handles an escaped quote inside a string', () => {
    expect(statementStarts(['s = "a \\" ( b"', 'from . import c'])).toEqual([0, 1]);
  });
  it('joins a parenthesised multi-line import', () => {
    expect(statementStarts(['from . import (', '    a,', '    b,', ')', 'x = 1'])).toEqual([0, 0, 0, 0, 4]);
  });
  it('joins a backslash continuation, but not a backslash inside a comment', () => {
    expect(statementStarts(['from . import \\', '    a', 'y = 1  # ends with \\', 'z = 2'])).toEqual([0, 0, 2, 3]);
  });
  it('nested brackets in a later default argument do not leak', () => {
    expect(statementStarts(['def f(x=(1, 2),', '      y=[3]):', '    pass', 'from . import d'])).toEqual([0, 0, 2, 3]);
  });
});
