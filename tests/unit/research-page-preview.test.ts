import { expect, it } from "vitest";
import { researchPagePreview } from "../../src/tools/live-research";

it("uses a real page image after skipping a logo and resolves its relative URL", () => {
  expect(
    researchPagePreview(
      "![Logo](/logo.svg)\n![The cafe](/photos/cafe.jpg)",
      "https://example.com/visit",
    ),
  ).toBe("https://example.com/photos/cafe.jpg");
});

it("never promotes inline, local or insecure images into a source preview", () => {
  expect(
    researchPagePreview(
      "![x](data:image/png;base64,abc)\n![x](https://127.0.0.1/image.jpg)\n![x](http://example.com/image.jpg)",
      "https://example.com",
    ),
  ).toBeUndefined();
});

it("keeps an image-less source image-less instead of inventing artwork", () => {
  expect(
    researchPagePreview("A source with no image", "https://example.com"),
  ).toBeUndefined();
});
