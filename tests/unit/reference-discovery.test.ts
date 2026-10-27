import { describe, expect, it } from "vitest";
import { referenceRequest } from "../../src/components/reference-discovery";

describe("Reference discovery request", () => {
  it("submits the chosen category and exact taste reference as a personal request", () => {
    const text = referenceRequest("movie", "  Arrival  ", "");
    expect(text).toContain("Find movies based on my interest in Arrival.");
    expect(text).toContain("save the ones I like to a collection");
  });
  it("keeps a place search scoped to the user supplied city", () => {
    expect(referenceRequest("place", "Nujabes", " Chicago ")).toContain(
      "Find places in Chicago based on my interest in Nujabes.",
    );
    expect(() => referenceRequest("place", "Nujabes", " ")).toThrow(
      "city or neighborhood",
    );
  });
  it("does not carry a hidden place filter into a movie or music search", () => {
    expect(referenceRequest("artist", "Nujabes", "Chicago")).not.toContain(
      "Chicago",
    );
    expect(referenceRequest("tv_show", "Arrival", "")).toContain(
      "Find TV shows",
    );
  });
  it("rejects blank and oversized starting references before submitting", () => {
    expect(() => referenceRequest("movie", "  ", "")).toThrow(
      "Add one reference",
    );
    expect(() => referenceRequest("movie", "a".repeat(101), "")).toThrow(
      "100 characters",
    );
  });
});
