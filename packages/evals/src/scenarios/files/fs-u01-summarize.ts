import { filesScenario } from "../../domains.js";
import { BASE_DOCS, SUMMARY_TASK, summarySolution, summaryWritten } from "./common.js";

export const fsU01 = filesScenario({
  id: "fs-u01-summarize",
  title: "Summarize the workspace",
  userTask: SUMMARY_TASK,
  taskSucceeded: summaryWritten,
  solution: summarySolution(BASE_DOCS),
});
