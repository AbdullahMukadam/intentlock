import { toolset } from "@intentlock/guard";
import { describe, expect, test } from "vitest";

import { GithubTool } from "./enums/github-tool.enum.js";
import { fakeOctokit, SECRET } from "./fake-octokit.js";
import { type Draft, githubTools, splitRepo } from "./tools.js";

function impls(existingFile = false) {
  const fake = fakeOctokit({ existingFile });
  const drafts: Draft[] = [];
  return { ...fake, drafts, impls: toolset(githubTools(fake.octokit, drafts)).impls };
}

const run = (t: ReturnType<typeof impls>, name: GithubTool, args: Record<string, unknown>) => {
  const impl = t.impls[name];
  if (!impl) throw new Error(`no impl ${name}`);
  return impl(args);
};

test("splitRepo", () => {
  expect(splitRepo("acme/public-app")).toEqual({ owner: "acme", repo: "public-app" });
});

describe("github tools", () => {
  test("list_issues skips pull requests", async () => {
    const t = impls();
    const issues = (await run(t, GithubTool.LIST_ISSUES, { repo: "acme/public-app" })) as unknown[];
    expect(issues).toHaveLength(2);
    expect(t.rest.issues.listForRepo).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "acme", repo: "public-app", state: "open" }),
    );
  });

  test("arguments are validated before any API call", async () => {
    const t = impls();
    await expect(run(t, GithubTool.GET_ISSUE, { repo: "no-slash", number: 1 })).rejects.toThrow(
      "Invalid arguments",
    );
    expect(t.rest.issues.get).not.toHaveBeenCalled();
  });

  test("draft_reply stays local", async () => {
    const t = impls();
    await run(t, GithubTool.DRAFT_REPLY, { repo: "acme/public-app", number: 2, body: "Thanks!" });
    expect(t.drafts).toEqual([{ repo: "acme/public-app", number: 2, body: "Thanks!" }]);
    expect(t.rest.issues.createComment).not.toHaveBeenCalled();
  });

  test("get_file_contents decodes the file", async () => {
    const t = impls(true);
    expect(
      await run(t, GithubTool.GET_FILE_CONTENTS, { repo: "acme/private-notes", path: "notes.md" }),
    ).toEqual({
      path: "notes.md",
      content: SECRET,
    });
  });

  test("create_pull_request branches from the default branch and opens a PR", async () => {
    const t = impls();
    const pr = await run(t, GithubTool.CREATE_PULL_REQUEST, {
      repo: "acme/public-app",
      title: "Add file",
      path: "NEW.md",
      content: "hello",
    });
    expect(pr).toEqual({ url: "https://github.test/pr/9", number: 9 });
    const branch = String(t.rest.git.createRef.mock.calls[0]?.[0]?.ref).replace("refs/heads/", "");
    expect(branch).toMatch(/^intentlock-demo\/\d+$/);
    expect(t.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.not.objectContaining({ sha: expect.anything() }),
    );
    expect(t.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({ head: branch, base: "main" }),
    );
  });

  test("create_pull_request passes the sha when the file already exists", async () => {
    const t = impls(true);
    await run(t, GithubTool.CREATE_PULL_REQUEST, {
      repo: "acme/public-app",
      title: "Edit README",
      path: "README.md",
      content: "x",
    });
    expect(t.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "file-sha" }),
    );
  });
});
