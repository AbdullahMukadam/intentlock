import { defineTool, type GuardTool } from "@intentlock/guard";
import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import { GithubTool } from "./enums/github-tool.enum.js";

const MAX_FILE_CHARS = 20_000;
const BRANCH_PREFIX = "intentlock-demo";

const Repo = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, "owner/name")
  .describe("Repository as owner/name");
const IssueNumber = z.number().int().positive().describe("Issue number");

export interface Draft {
  repo: string;
  number: number;
  body: string;
}

export function splitRepo(full: string) {
  const [owner = "", repo = ""] = full.split("/");
  return { owner, repo };
}

export function githubTools(octokit: Octokit, drafts: Draft[] = []): GuardTool[] {
  return [
    defineTool({
      name: GithubTool.LIST_ISSUES,
      description: "List open issues in a repository",
      schema: z.object({ repo: Repo }),
      impl: async ({ repo }) => {
        const { data } = await octokit.rest.issues.listForRepo({
          ...splitRepo(repo),
          state: "open",
          per_page: 20,
        });
        return data
          .filter((i) => !i.pull_request)
          .map((i) => ({
            number: i.number,
            title: i.title,
            author: i.user?.login ?? null,
            labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
          }));
      },
    }),
    defineTool({
      name: GithubTool.GET_ISSUE,
      description: "Read one issue including its body",
      schema: z.object({ repo: Repo, number: IssueNumber }),
      impl: async ({ repo, number }) => {
        const { data } = await octokit.rest.issues.get({
          ...splitRepo(repo),
          issue_number: number,
        });
        return {
          number: data.number,
          title: data.title,
          author: data.user?.login,
          body: data.body,
        };
      },
    }),
    defineTool({
      name: GithubTool.ADD_LABEL,
      description: "Add a label to an issue",
      schema: z.object({ repo: Repo, number: IssueNumber, label: z.string().min(1).max(50) }),
      impl: async ({ repo, number, label }) => {
        await octokit.rest.issues.addLabels({
          ...splitRepo(repo),
          issue_number: number,
          labels: [label],
        });
        return { labeled: number, label };
      },
    }),
    defineTool({
      name: GithubTool.DRAFT_REPLY,
      description: "Save a reply draft locally without posting it",
      schema: z.object({ repo: Repo, number: IssueNumber, body: z.string().min(1).max(5000) }),
      impl: async (draft) => {
        drafts.push(draft);
        return { drafted: draft.number };
      },
    }),
    defineTool({
      name: GithubTool.POST_COMMENT,
      description: "Post a public comment on an issue",
      schema: z.object({ repo: Repo, number: IssueNumber, body: z.string().min(1).max(5000) }),
      impl: async ({ repo, number, body }) => {
        const { data } = await octokit.rest.issues.createComment({
          ...splitRepo(repo),
          issue_number: number,
          body,
        });
        return { url: data.html_url };
      },
    }),
    defineTool({
      name: GithubTool.GET_FILE_CONTENTS,
      description: "Read a file from a repository",
      schema: z.object({ repo: Repo, path: z.string().min(1).max(300) }),
      impl: async ({ repo, path }) => {
        const { data } = await octokit.rest.repos.getContent({ ...splitRepo(repo), path });
        if (Array.isArray(data)) return { directory: data.map((e) => e.path) };
        if (!("content" in data)) return { error: `${path} is not a file` };
        return {
          path,
          content: Buffer.from(data.content, "base64").toString("utf8").slice(0, MAX_FILE_CHARS),
        };
      },
    }),
    defineTool({
      name: GithubTool.LIST_REPOS,
      description: "List repositories the token can access",
      schema: z.object({}),
      impl: async () => {
        const { data } = await octokit.rest.repos.listForAuthenticatedUser({ per_page: 50 });
        return data.map((r) => ({ repo: r.full_name, private: r.private }));
      },
    }),
    defineTool({
      name: GithubTool.CREATE_PULL_REQUEST,
      description: "Open a pull request that adds or replaces one file",
      schema: z.object({
        repo: Repo,
        title: z.string().min(1).max(200),
        body: z.string().max(5000).default(""),
        path: z.string().min(1).max(300),
        content: z.string().max(100_000),
      }),
      impl: async ({ repo, title, body, path, content }) => {
        const target = splitRepo(repo);
        const { data: meta } = await octokit.rest.repos.get(target);
        const { data: base } = await octokit.rest.git.getRef({
          ...target,
          ref: `heads/${meta.default_branch}`,
        });
        const branch = `${BRANCH_PREFIX}/${Date.now()}`;
        await octokit.rest.git.createRef({
          ...target,
          ref: `refs/heads/${branch}`,
          sha: base.object.sha,
        });
        const sha = await octokit.rest.repos.getContent({ ...target, path, ref: branch }).then(
          ({ data }) => (!Array.isArray(data) && "sha" in data ? data.sha : undefined),
          () => undefined,
        );
        await octokit.rest.repos.createOrUpdateFileContents({
          ...target,
          path,
          branch,
          ...(sha && { sha }),
          message: title,
          content: Buffer.from(content, "utf8").toString("base64"),
        });
        const { data: pr } = await octokit.rest.pulls.create({
          ...target,
          title,
          body,
          head: branch,
          base: meta.default_branch,
        });
        return { url: pr.html_url, number: pr.number };
      },
    }),
  ];
}
