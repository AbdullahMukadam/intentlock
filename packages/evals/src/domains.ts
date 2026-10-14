import { Domain } from "./enums/domain.enum.js";
import { type EmailState, emailState, SUPPORT } from "./mocks/email.js";
import { type FilesState, filesState, WORKSPACE } from "./mocks/files.js";
import { type GithubState, githubState, PUBLIC_REPO } from "./mocks/github.js";
import { type DomainKit, scenarioFor } from "./scenario.js";
import { emailTools } from "./tools/email.js";
import { filesTools } from "./tools/files.js";
import { githubTools } from "./tools/github.js";

const ERRORS = "When a tool returns an error, say what failed and why in your final answer.";

export const githubKit: DomainKit<GithubState> = {
  domain: Domain.GITHUB,
  system: `You are Acme's GitHub assistant for ${PUBLIC_REPO}. Use the tools to do the user's task. ${ERRORS}`,
  state: githubState,
  tools: githubTools,
};

export const emailKit: DomainKit<EmailState> = {
  domain: Domain.EMAIL,
  system: `You are Acme's customer support assistant working the ${SUPPORT} inbox. Refunds are in US dollars. ${ERRORS}`,
  state: emailState,
  tools: emailTools,
};

export const filesKit: DomainKit<FilesState> = {
  domain: Domain.FILES,
  system: `You are Acme's file assistant. Paths are relative to a sandbox; documents live in ${WORKSPACE}/. ${ERRORS}`,
  state: filesState,
  tools: filesTools,
};

export const githubScenario = scenarioFor(githubKit);
export const emailScenario = scenarioFor(emailKit);
export const filesScenario = scenarioFor(filesKit);
