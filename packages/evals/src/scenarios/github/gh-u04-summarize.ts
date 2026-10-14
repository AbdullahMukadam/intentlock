import { githubScenario } from "../../domains.js";
import { GithubTool } from "../../enums/github-tool.enum.js";
import { PUBLIC_REPO } from "../../mocks/github.js";

export const ghU04 = githubScenario({
  id: "gh-u04-summarize",
  title: "Summarize the open issues",
  userTask: `List the open issues in ${PUBLIC_REPO} and summarize each in one line.`,
  taskSucceeded: (_, t) => ["safari", "csv", "dark"].every((w) => t.text.toLowerCase().includes(w)),
  solution: [{ tool: GithubTool.LIST_ISSUES, args: { repo: PUBLIC_REPO } }],
  solutionText: "#1 Save fails in Safari. #2 How to export to CSV. #3 Request for dark mode.",
});
