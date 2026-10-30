import { expect, test } from "@playwright/test";

test("cinematic Home accepts arbitrary editable prompts without domain intake", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /Your agent.*With taste/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find a place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Find a place" }).click();
  await expect(page.getByRole("textbox", { name: "Message Igor" })).toHaveValue(
    /find a place/,
  );
  await page
    .getByRole("textbox", { name: "Message Igor" })
    .fill("Explain the major differences between two database indexes.");
  await expect(page.getByRole("textbox", { name: "Message Igor" })).toHaveValue(
    /database indexes/,
  );
  await page.screenshot({
    path: "test-results/reference-native-home-desktop.png",
  });
});

test("Discover opens in the same authenticated workspace, with honest empty results", async ({
  page,
}) => {
  await page.goto("/app?view=explore");
  await expect(
    page.getByRole("searchbox", { name: "Discover across any domain" }),
  ).toBeVisible();
  await expect(page.locator(".ir-reference-tile")).toHaveCount(10);
  await expect(
    page
      .getByRole("navigation", { name: "Product navigation" })
      .getByRole("button", { name: "Create" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/reference-native-discover-desktop.png",
  });
});

test("mobile navigation keeps all primary actions accessible without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const nav = page.getByRole("navigation", { name: "Product navigation" });

  for (const name of ["Home", "Explore", "Create", "Search", "Library"]) {
    await expect(nav.getByRole("button", { name })).toBeVisible();
  }

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/reference-native-home-mobile.png",
  });
  await nav.getByRole("button", { name: "Explore" }).click();
  await expect(
    page.getByRole("heading", { name: "Explore", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/reference-native-discover-mobile.png",
  });
});

test("Home reconstructs the supplied desktop visual grid at original dimensions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1448, height: 1086 });
  await page.goto("/app");
  const elements = {
    sidebar: page.locator(".iw-nav"),
    title: page.locator(".iw-intro h1"),
    search: page.locator(".iw-welcome .iw-composer"),
    chips: page.locator(".iw-quick-start"),
    firstCard: page.locator(".iw-story-card").first(),
    lastCard: page.locator(".iw-story-card").last(),
  };

  const box = async (locator: typeof elements.sidebar) => {
    const rect = await locator.boundingBox();
    expect(rect).toBeTruthy();

    return rect!;
  };

  const sidebar = await box(elements.sidebar);
  const title = await box(elements.title);
  const search = await box(elements.search);
  const chips = await box(elements.chips);
  const firstCard = await box(elements.firstCard);
  const lastCard = await box(elements.lastCard);
  console.log(
    "IGOR_VISUAL_METRIC_HOME",
    JSON.stringify({ sidebar, title, search, chips, firstCard, lastCard }),
  );
  expect(sidebar.width).toBeGreaterThan(185);
  expect(sidebar.width).toBeLessThan(230);
  expect(firstCard.y).toBeGreaterThan(chips.y);
  expect(lastCard.x).toBeGreaterThan(firstCard.x + 700);
  await page.screenshot({
    path: "test-results/igor-reference-home-1448.png",
    fullPage: false,
  });
});

test("Discover retains five portrait and five landscape cards in the reference grid", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1448, height: 1086 });
  await page.goto("/app?view=explore");
  await expect(
    page.locator(".ir-reference-portrait .ir-reference-tile"),
  ).toHaveCount(5);
  await expect(
    page.locator(".ir-reference-landscape .ir-reference-tile"),
  ).toHaveCount(5);
  const selectors = [
    ".iw-nav",
    ".ir-search",
    ".ir-chip-row",
    ".ir-reference-portrait .ir-reference-image",
    ".ir-reference-landscape .ir-reference-image",
  ];
  const metrics = [];

  for (const selector of selectors) {
    metrics.push({
      selector,
      box: await page.locator(selector).first().boundingBox(),
    });
  }

  console.log("IGOR_VISUAL_METRIC_EXPLORE", JSON.stringify(metrics));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "test-results/igor-reference-explore-1448.png",
    fullPage: false,
  });
});
