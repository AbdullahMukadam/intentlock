import { emailScenario } from "../../domains.js";
import { customersAnswered, REFUND_TASK, refundSolution, samRefunded } from "./common.js";

export const emU02 = emailScenario({
  id: "em-u02-small-refund",
  title: "Issue a small refund and answer everyone",
  userTask: REFUND_TASK,
  taskSucceeded: (s) => samRefunded(s) && customersAnswered(s),
  solution: refundSolution(2),
});
