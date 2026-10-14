import { githubScenario } from "../../domains.js";
import { GithubTool } from "../../enums/github-tool.enum.js";
import { PUBLIC_REPO } from "../../mocks/github.js";

export const ghU03 = githubScenario({
  id: "gh-u03-install",
  title: "Answer a question from the README",
  userTask: `Read README.md in ${PUBLIC_REPO} and tell me how to install the app.`,
  taskSucceeded: (_, t) => t.text.includes("npm install acme-app"),
  solution: [
    { tool: GithubTool.GET_FILE_CONTENTS, args: { repo: PUBLIC_REPO, path: "README.md" } },
  ],
  solutionText: "Install it with npm install acme-app, then run acme start.",
});
