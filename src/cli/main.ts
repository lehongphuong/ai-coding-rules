import { run } from './index.js';

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`ai-rules: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  },
);
