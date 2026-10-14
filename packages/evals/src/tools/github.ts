import { defineTool, type GuardTool } from "@intentlock/guard";
import { z } from "zod";

import { GithubTool } from "../enums/github-tool.enum.js";
import { BOT, type GithubState } from "../mocks/github.js";

const Repo = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, "owner/name")
  .describe("Repository as owner/name");
const IssueNumber = z.number().int().positive().describe("Issue number");

export function githubTools(state: GithubState): GuardTool[] {
  const repo = (name: string) => {
    const r = state.repos[name];
    if (!r) throw new Error(`Repository ${name} not found`);
    return r;
  };
  const issueIn = (name: string, number: number) => {
    repo(name);
    const found = state.issues.find((i) => i.repo === name && i.number === number);
    if (!found) throw new Error(`Issue #${number} not found in ${name}`);
    return found;
  };
  return [
    defineTool({
      name: GithubTool.LIST_ISSUES,
      description: "List open issues in a repository",
      schema: z.object({ repo: Repo }),
      impl: async ({ repo: name }) => {
        repo(name);
        return state.issues
          .filter((i) => i.repo === name)
          .map(({ number, title, author, labels }) => ({ number, title, author, labels }));
      },
    }),
    defineTool({
      name: GithubTool.GET_ISSUE,
      description: "Read one issue including its body and comments",
      schema: z.object({ repo: Repo, number: IssueNumber }),
      impl: async ({ repo: name, number }) => {
        const { title, author, body, comments } = issueIn(name, number);
        return { number, title, author, body, comments };
      },
    }),
    defineTool({
      name: GithubTool.ADD_LABEL,
      description: "Add a label to an issue",
      schema: z.object({ repo: Repo, number: IssueNumber, label: z.string().min(1).max(50) }),
      impl: async ({ repo: name, number, label }) => {
        issueIn(name, number).labels.push(label);
        return { labeled: number, label };
      },
    }),
    defineTool({
      name: GithubTool.POST_COMMENT,
      description: "Post a public comment on an issue",
      schema: z.object({ repo: Repo, number: IssueNumber, body: z.string().min(1).max(5000) }),
      impl: async ({ repo: name, number, body }) => {
        issueIn(name, number).comments.push({ author: BOT, body });
        return { commented: number };
      },
    }),
    defineTool({
      name: GithubTool.GET_FILE_CONTENTS,
      description: "Read a file from a repository",
      schema: z.object({ repo: Repo, path: z.string().min(1).max(300) }),
      impl: async ({ repo: name, path }) => {
        const content = repo(name).files[path];
        if (content === undefined) throw new Error(`${path} not found in ${name}`);
        return { path, content };
      },
    }),
    defineTool({
      name: GithubTool.LIST_REPOS,
      description: "List repositories the token can access",
      schema: z.object({}),
      impl: async () =>
        Object.entries(state.repos).map(([name, r]) => ({
          repo: name,
          private: r.private,
          description: r.description,
        })),
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
      impl: async (pr) => {
        repo(pr.repo);
        state.prs.push(pr);
        return { number: state.prs.length };
      },
    }),
  ];
}
