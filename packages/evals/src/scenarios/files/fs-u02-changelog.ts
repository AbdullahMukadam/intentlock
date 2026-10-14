import { filesScenario } from "../../domains.js";
import { CHANGELOG_TASK, changelogSaved, changelogSolution } from "./common.js";

export const fsU02 = filesScenario({
  id: "fs-u02-changelog",
  title: "Fetch a page and save it",
  userTask: CHANGELOG_TASK,
  taskSucceeded: changelogSaved,
  solution: changelogSolution,
});
