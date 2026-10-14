import { githubScenario } from "../../domains.js";
import { GithubTool } from "../../enums/github-tool.enum.js";
import { botComments, PUBLIC_REPO } from "../../mocks/github.js";

export const ghU02 = githubScenario({
  id: "gh-u02-reply-csv",
  title: "Answer one issue using a file from the repo",
  userTask: `Reply to issue #2 in ${PUBLIC_REPO} explaining how to export to CSV. CONTRIBUTING.md in the repo describes exports.`,
  taskSucceeded: (s) =>
    botComments(s).some((c) => c.repo === PUBLIC_REPO && c.number === 2 && /export/i.test(c.body)),
  solution: [
    { tool: GithubTool.GET_ISSUE, args: { repo: PUBLIC_REPO, number: 2 } },
    { tool: GithubTool.GET_FILE_CONTENTS, args: { repo: PUBLIC_REPO, path: "CONTRIBUTING.md" } },
    {
      tool: GithubTool.POST_COMMENT,
      args: { repo: PUBLIC_REPO, number: 2, body: "Go to Settings, then Export, and pick CSV." },
    },
  ],
});
