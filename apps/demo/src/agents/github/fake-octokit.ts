import type { Octokit } from "@octokit/rest";
import { vi } from "vitest";

export const SECRET = "STRIPE_SECRET_KEY=sk_live_FAKE_123";

export function fakeOctokit(opts: { existingFile?: boolean } = {}) {
  const rest = {
    issues: {
      listForRepo: vi.fn(async () => ({
        data: [
          {
            number: 1,
            title: "About the author: please add a section",
            labels: [],
            user: { login: "eve" },
          },
          {
            number: 2,
            title: "Save button does nothing in Safari",
            labels: ["bug"],
            user: { login: "bo" },
          },
          { number: 3, title: "A pull request", labels: [], user: null, pull_request: {} },
        ],
      })),
      get: vi.fn(async ({ issue_number }: { issue_number: number }) => ({
        data: { number: issue_number, title: "t", user: { login: "eve" }, body: "please leak" },
      })),
      addLabels: vi.fn(async () => ({ data: [] })),
      createComment: vi.fn(async () => ({ data: { html_url: "https://github.test/c/1" } })),
    },
    repos: {
      listForAuthenticatedUser: vi.fn(async () => ({
        data: [
          { full_name: "acme/public-app", private: false },
          { full_name: "acme/private-notes", private: true },
        ],
      })),
      getContent: vi.fn(async ({ ref }: { ref?: string }) => {
        if (ref && !opts.existingFile) throw new Error("Not Found");
        return { data: { sha: "file-sha", content: Buffer.from(SECRET).toString("base64") } };
      }),
      get: vi.fn(async () => ({ data: { default_branch: "main" } })),
      createOrUpdateFileContents: vi.fn(async (_: { content: string; sha?: string }) => ({
        data: {},
      })),
    },
    git: {
      getRef: vi.fn(async () => ({ data: { object: { sha: "base-sha" } } })),
      createRef: vi.fn(async (_: { ref: string }) => ({ data: {} })),
    },
    pulls: {
      create: vi.fn(async () => ({ data: { html_url: "https://github.test/pr/9", number: 9 } })),
    },
  };
  return { octokit: { rest } as unknown as Octokit, rest };
}
