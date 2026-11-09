// T117: picomatch (v4) ships no .d.ts and no `@types/picomatch` package exists for v4 (only an unofficial v2
// gist). Minimal ambient declaration of the one entry point Mole uses (`makeRe`), scoped to this package so a
// future real upstream types package can simply replace this file.
declare module 'picomatch' {
  interface PicomatchOptions {
    dot?: boolean;
    nocase?: boolean;
    windows?: boolean;
    [key: string]: unknown;
  }
  function makeRe(pattern: string, options?: PicomatchOptions): RegExp;
  const picomatch: { makeRe: typeof makeRe };
  export = picomatch;
}
