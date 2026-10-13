import { demoMessages, expectedCases } from "../data/mailbox.js";
import type { Message, Category } from "../src/shared/types.js";
export const cases = demoMessages.map((m, index) => ({
  name: m.subject,
  messages: [m],
  expected: {
    ...expectedCases[index],
    teamId:
      (
        {
          content_authoring: "content",
          component_defect: m.affectedUrl.includes("patient")
            ? "patient-dev"
            : "hcp-dev",
          dns: "infrastructure",
          integrations: "martech",
          deployments: "devops",
          localization: "localization",
          iam: "iam",
          accessibility: "accessibility",
          security: "security",
        } as Partial<Record<Category, string>>
      )[expectedCases[index].category as Category] || null,
  },
}));
const variant = (n: number, body: string, url: string): Message => ({
  ...demoMessages[4],
  messageId: `eval-${n}`,
  threadId: `eval-thread-${n}`,
  subject: "Clarification needed",
  body,
  affectedUrl: url,
});
// Additional challenge cases exercise ambiguity and updated conversations.
cases.push(
  ...([
    {
      name: "Unknown host",
      messages: [
        variant(
          16,
          "The new site is failing. Please investigate.",
          "https://unmapped.example.com/",
        ),
      ],
      expected: {
        messageId: "eval-16",
        ticketType: "investigation_request",
        category: "unknown",
        program: null,
        teamId: null,
      },
    },
    {
      name: "Spoofed known-host suffix",
      messages: [
        variant(
          17,
          "The site is failing but we have no impact details.",
          "https://patient.example.com.evil.example/",
        ),
      ],
      expected: {
        messageId: "eval-17",
        ticketType: "investigation_request",
        category: "unknown",
        program: null,
        teamId: null,
      },
    },
    {
      name: "Conflicting programs",
      messages: [
        variant(
          18,
          "Both https://patient.example.com/ and https://hcp.example.com/ need investigation. Symptoms and impact are not yet known.",
          "",
        ),
      ],
      expected: {
        messageId: "eval-18",
        ticketType: "investigation_request",
        category: "unknown",
        program: null,
        teamId: null,
      },
    },
    {
      name: "New thread without URL",
      messages: [
        variant(
          19,
          "Please provide access to a new author. We can supply the program and authorization later.",
          "",
        ),
      ],
      expected: {
        messageId: "eval-19",
        ticketType: "service_request",
        category: "iam",
        program: null,
        teamId: null,
      },
    },
    {
      name: "Reply adds a browser detail",
      messages: [
        demoMessages[1],
        {
          ...variant(
            20,
            "Safari 18.1 is affected. The registration failure still occurs.",
            "https://patient-br.example.com/register",
          ),
          threadId: demoMessages[1].threadId,
        },
      ],
      expected: {
        messageId: "eval-20",
        ticketType: "incident",
        category: "component_defect",
        program: "patient",
        teamId: "patient-dev",
      },
    },
  ] as typeof cases),
);
