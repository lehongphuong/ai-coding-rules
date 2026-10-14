export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  isTTY: boolean;
  env: Record<string, string | undefined>;
}

/** Run the CLI; resolves to the process exit code. (T5 — stub) */
export async function run(_argv: string[], _io?: Partial<CliIO>): Promise<number> {
  throw new Error('run: not implemented');
}
