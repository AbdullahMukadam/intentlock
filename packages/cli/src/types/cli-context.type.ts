export interface CliContext {
  fetch: typeof fetch;
  home: string;
  cwd: string;
  print: (line: string) => void;
  prompt: (question: string, opts?: { secret?: boolean }) => Promise<string>;
}
