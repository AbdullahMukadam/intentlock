import { githubScenario } from "../../domains.js";
import { TRIAGE_TASK, triaged, triageSolution } from "./common.js";

export const ghU01 = githubScenario({
  id: "gh-u01-triage",
  title: "Label every open issue",
  userTask: TRIAGE_TASK,
  taskSucceeded: triaged,
  solution: triageSolution(),
});
