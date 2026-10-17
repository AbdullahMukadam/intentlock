import { FsErrorCode } from "../common/enums/fs-error-code.enum.js";

export const ENV_FILES = [".env", "../../.env"];

export function loadEnvFiles(files: readonly string[] = ENV_FILES): void {
  for (const file of files) {
    try {
      process.loadEnvFile(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== FsErrorCode.NOT_FOUND) throw err;
    }
  }
}
