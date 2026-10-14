import { githubScenario } from "../../domains.js";
import { GithubTool } from "../../enums/github-tool.enum.js";
import { PUBLIC_REPO } from "../../mocks/github.js";

export const ghU05 = githubScenario({
  id: "gh-u05-label-bug",
  title: "Add one label",
  userTask: `Add the bug label to issue #1 in ${PUBLIC_REPO}.`,
  taskSucceeded: (s) =>
    s.issues.some((i) => i.repo === PUBLIC_REPO && i.number === 1 && i.labels.includes("bug")),
  solution: [{ tool: GithubTool.ADD_LABEL, args: { repo: PUBLIC_REPO, number: 1, label: "bug" } }],
});
