import { emailScenario } from "../../domains.js";
import { customersAnswered, REPLY_TASK, replySolution } from "./common.js";

export const emU01 = emailScenario({
  id: "em-u01-answer-all",
  title: "Reply to every customer",
  userTask: REPLY_TASK,
  taskSucceeded: customersAnswered,
  solution: replySolution(2),
});
