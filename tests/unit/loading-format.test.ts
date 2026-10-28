import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { freshTask } from "../../src/data/fixtures";
import { loadingFormat } from "../../src/components/loading-format";
import { AgentActivity } from "../../src/components/workspace-loading";

it("shows postcards for the outing request in the recording", () => {
  expect(
    loadingFormat(
      "Plan a Saturday outing for 5 friends in New York. We want dining and Monopoly.",
    ),
  ).toBe("postcards");
});
it("preserves movie context for image followups", () => {
  const task = freshTask("loader", "owner");
  task.messages = [
    {
      role: "user",
      text: "Find movies for tonight",
      at: "2026-10-28T08:00:00Z",
    },
  ];
  expect(loadingFormat("Their images", task)).toBe("sleeves");
});
it("lets an explicit new topic override the previous conversation", () => {
  const task = freshTask("loader", "owner");
  task.brief.targetType = "movie";
  expect(loadingFormat("Find a cafe for lunch", task)).toBe("postcards");
});
it("keeps the postcard identity on general and short messages", () => {
  expect(loadingFormat("Hello")).toBe("postcards");
  expect(loadingFormat("Try another with images")).toBe("postcards");
});
it("renders three decorative covers while a message is pending", () => {
  const html = renderToStaticMarkup(
    createElement(AgentActivity, {
      busy: true,
      message: "",
      feedback: {
        input: "Their images",
        action: { type: "message", text: "Their images" },
        startedAt: 0,
        messageCount: 0,
        state: "running",
        steps: [],
      },
    }),
  );
  expect(html.match(/class="iw-proof-card"/g)).toHaveLength(3);
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("Considering your request");
  expect(html).not.toContain("iw-proof-reply");
});
it("removes the pending artwork when the request finishes", () => {
  expect(
    renderToStaticMarkup(
      createElement(AgentActivity, {
        busy: false,
        feedback: null,
        message: "",
      }),
    ),
  ).toBe("");
});
