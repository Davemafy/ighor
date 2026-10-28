import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationThread } from "../../src/components/discovery/conversation-thread";
import { EvidenceView } from "../../src/components/evidence-view";
import { freshTask } from "../../src/data/fixtures";

describe("web research source UI", () => {
  it("keeps real URLs and source limitations visible in the existing transcript", () => {
    const task = freshTask("source-ui", "owner");
    task.mode = "qloo-live";
    const id = "source-ui:web:1:web-1";
    task.evidence.push({
      id,
      source: "provider-returned",
      kind: "practical",
      at: "2026-10-28T00:00:00.000Z",
      reference: "https://example.org/public-report",
      entityIds: [],
      summary: "Public report: search snippet only",
      limitations: ["Search snippet only; webpage was not opened."],
      explanation: null,
      dependencies: [],
      freshness: "current",
    });
    task.messages.push({
      role: "assistant",
      text: "I retrieved a public report [web-1].",
      kind: "conversation",
      evidenceIds: [id],
      at: "2026-10-28T00:00:00.000Z",
    });

    const thread = renderToStaticMarkup(createElement(ConversationThread, { task }));
    expect(thread).toContain("Open retrieved source");
    expect(thread).toContain('href="https://example.org/public-report"');
    expect(thread).toContain("Search snippet only; webpage was not opened.");

    const panel = renderToStaticMarkup(
      createElement(EvidenceView, {
        task,
        busy: false,
        onAction: () => {},
      }),
    );
    expect(panel).toContain("Web source");
    expect(panel).toContain("Open public source");
    expect(panel).toContain('href="https://example.org/public-report"');
    expect(panel).not.toContain("Practical facts remain user-supplied");
  });
});
