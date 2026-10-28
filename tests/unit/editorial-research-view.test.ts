import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { freshTask } from "../../src/data/fixtures";
import {
  buildResearchCards,
  ResearchDiscovery,
} from "../../src/components/research-discovery";

const at = "2026-10-28T07:00:00.000Z";

function taskWithSources() {
  const task = freshTask("visual-outing", "owner");
  task.artifacts.push({
    id: "web-research-1",
    kind: "research-report",
    title: "New York — options to check",
    content: "# Explored options\nEvidence is incomplete.",
    version: 1,
    dependencies: ["evidence:research"],
    evidenceIds: ["web-a", "web-b", "qloo-c"],
    assumptions: ["No confirmed reservations"],
    freshness: "current",
    edited: false,
  });
  task.evidence.push(
    {
      id: "web-a",
      source: "provider-returned",
      kind: "practical",
      at,
      reference: "https://example.com/venue",
      title: "An actual venue site",
      previewImageUrl: "https://images.example.com/venue.jpg",
      entityIds: [],
      summary: "An actual venue site: A place where people can meet.",
      limitations: ["Check opening hours."],
      explanation: null,
      dependencies: [],
      freshness: "current",
    },
    {
      id: "web-b",
      source: "provider-returned",
      kind: "practical",
      at,
      reference: "https://www.yelp.com/search?find_desc=board+games",
      title: "Yelp search listing",
      entityIds: [],
      summary: "Yelp search listing: Directory results are unverified.",
      limitations: ["Search snippet only."],
      explanation: null,
      dependencies: [],
      freshness: "current",
    },
    {
      id: "qloo-c",
      source: "provider-returned",
      kind: "cultural",
      at,
      reference: "https://api.qloo.com/v2/insights",
      entityIds: [],
      summary: "A Qloo location/category match, not personalized taste.",
      limitations: ["Game selection unknown."],
      explanation: null,
      dependencies: [],
      freshness: "current",
    },
  );

  return task;
}

describe("editorial research outcome", () => {
  it("sorts real source pages above directory searches without calling them verified bookings", () => {
    const cards = buildResearchCards(taskWithSources());
    expect(cards?.findings.map((f) => f.verification)).toEqual([
      "Web source",
      "Secondary reference",
      "Qloo match",
    ]);
    expect(cards?.findings[0]).toMatchObject({
      imageUrl: "https://images.example.com/venue.jpg",
      url: "https://example.com/venue",
    });
    expect(cards?.findings[2].url).toBeNull();
  });

  it("renders real previews without invented poster headlines or venue claims", () => {
    const html = renderToStaticMarkup(
      createElement(ResearchDiscovery, {
        task: taskWithSources(),
      }),
    );
    expect(html).toContain("New York — options to check");
    expect(html).not.toContain("Out in the world.");
    expect(html).not.toContain("ird-cover-title");
    expect(html).toContain("An actual venue site");
    expect(html).toContain("images.example.com/venue.jpg");
    expect(html).toContain("Filter references");
    expect(html).toContain("About these sources");
    expect(html).toContain("not confirmation of a venue");
    expect(html).not.toContain("tool.invoke");
    expect(html).not.toContain("https://api.qloo.com/v2/insights");
  });

  it("does not invent a venue or image when research returned nothing", () => {
    const task = taskWithSources();
    task.evidence = [];
    const html = renderToStaticMarkup(
      createElement(ResearchDiscovery, { task }),
    );
    expect(html).toContain("No references yet");
    expect(html).not.toContain("<img");
  });

  it("does not change the presentation for unrelated work", () => {
    const task = freshTask("creative", "owner");
    expect(buildResearchCards(task)).toBeNull();
  });
});
