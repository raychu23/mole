// Bundles the extension host code (CommonJS, vscode external) and the webview script (browser IIFE).
import { build } from 'esbuild';

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'node22' };
await build({ ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs', platform: 'node', format: 'cjs', external: ['vscode'] });
await build({ ...common, entryPoints: ['webview/main.ts'], outfile: 'dist/webview.js', platform: 'browser', format: 'iife', target: 'es2022' });
