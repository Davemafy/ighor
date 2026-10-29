import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

const root = process.env.IGOR_VERIFY_BASE || "http://127.0.0.1:3570";
const output = "test-results/live-experiences";
const requested = process.env.IGOR_LIVE_JOURNEY || "both";
const names =
  requested === "both" ? ["gathering", "listening-bar"] : [requested];

if (names.some((name) => !["gathering", "listening-bar"].includes(name))) {
  throw Error("unsupported_journey");
}

await fs.mkdir(output, { recursive: true });
const report = {
  provenance: "Authorized LIVE attempt; per-source delivery remains explicit",
  passed: false,
  journeys: [],
};
const browser = await chromium.launch({ headless: true });
const documents = (task) => [
  ...task.artifacts,
  ...(task.work?.documents || []).map((d) => ({
    ...d,
    id: `document:${d.id}`,
  })),
];
const cultural = (task) =>
  task.evidence.filter(
    (e) => e.kind === "cultural" && e.freshness === "current",
  );
const snapshot = (task) => ({
  version: task.brief.version,
  status: task.status,
  acceptance: task.agentRun?.acceptance?.status ?? null,
  budget: task.work?.budget?.amount ?? null,
  usage: task.agentRun?.usage ?? null,
  steps: (task.agentRun?.steps || []).map(
    ({ tool, status, requests, summary }) => ({
      tool,
      status,
      requests,
      summary: summary.slice(0, 600),
    }),
  ),
  evidence: cultural(task).map(({ id, source, delivery }) => ({
    id,
    source,
    delivery,
  })),
  documents: documents(task).map(({ id, title, freshness, content }) => ({
    id,
    title,
    freshness,
    characters: content.length,
  })),
  failures: task.trace
    .filter((t) => /error|rejected/.test(t.action))
    .map((t) => ({
      action: t.action,
      category: /^agent\.(decision|requirements)\.error$/.test(t.action)
        ? t.outcome
        : t.outcome
            .match(/Diagnostic: ([^.]+)|failed \(([^)]+)\)/)
            ?.slice(1)
            .filter(Boolean)
            .join(";") || "unclassified",
    })),
});

function require(condition, code) {
  if (!condition) {
    throw Error(code);
  }
}

async function writeReport() {
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}

try {
  for (const name of names) {
    const result = { name, passed: false, turns: [], checks: {} };
    report.journeys.push(result);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: output, size: { width: 1440, height: 1000 } },
    });
    const page = await context.newPage();
    let task;

    const readTask = async () => {
      const response = await page.request.get(`${root}/api/tasks/${task.id}`);
      require(response.ok(), "saved_workspace_http");

      return response.json();
    };

    const pane = async (name) => {
      const control = page
        .getByRole("navigation", { name: "Conversation and work" })
        .getByRole("button", { name, exact: true });

      if (await control.isVisible()) {
        await control.click();
      }
    };

    async function finishTurn(turnId) {
      const deadline = Date.now() + 240000;

      while (Date.now() < deadline) {
        const response = await page.request.get(
          `${root}/api/tasks/${task.id}/turn?turnId=${encodeURIComponent(turnId)}`,
        );
        require(response.ok(), "turn_journal_http");
        const journal = await response.json();

        if (!["accepted", "running"].includes(journal.status)) {
          task = journal.task;
          result.turns.push(snapshot(task));
          await writeReport();

          return task;
        }

        await new Promise((resolve) => setTimeout(resolve, 750));
      }

      task = await readTask();
      result.turns.push(snapshot(task));
      await writeReport();
      throw Error("turn_deadline_saved_state_preserved");
    }

    async function message(text) {
      await pane("Conversation");
      const input = page.getByRole("textbox", {
        name: "Message Igor",
        exact: true,
      });
      await input.waitFor({ state: "visible" });
      await page.locator(".iw-composer[data-busy=false]").waitFor();
      await input.fill(text);
      const pending = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/tasks/${task.id}/turn`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Send message" }).click();
      const response = await pending;
      require(response.ok(), `turn_http_${response.status()}`);
      const payload = response.request().postDataJSON();
      require(typeof payload.clientTurnId ===
        "string", "missing_durable_turn_id");
      await finishTurn(payload.clientTurnId);
      require(task.messages.some(
        (m) => m.role === "user" && m.text === text,
      ), "accepted_message_missing");
      // Reload resolves an interrupted browser stream from authoritative saved state.
      await page.reload();
      await page
        .getByRole("textbox", { name: "Message Igor", exact: true })
        .waitFor();

      return task;
    }

    async function ownerActions(actions) {
      task = await readTask();
      const turnId = randomUUID();
      const response = await page.request.post(
        `${root}/api/tasks/${task.id}/turn`,
        {
          headers: { Origin: root },
          data: {
            type: "work",
            actions,
            version: task.brief.version,
            clientTurnId: turnId,
            workspaceId: task.id,
          },
          timeout: 240000,
        },
      );
      require(response.ok(), "owner_action_http");
      await finishTurn(turnId);
    }

    try {
      const created = await page.request.post(`${root}/api/tasks`, {
        headers: { Origin: root },
      });
      require(created.ok(), "workspace_creation_http");
      task = await created.json();
      require(task.mode === "qloo-live", "fixture_mode_forbidden");
      await page.addInitScript(
        (id) => localStorage.setItem("igor-task", id),
        task.id,
      );
      await page.goto(`${root}/app`);
      await message(
        name === "gathering"
          ? "I'm planning a gathering for six friends. We like independent films and alternative music. Help me make the night feel special without overspending."
          : "I want to open a small listening bar for people into alternative music and independent art. I want a distinctive atmosphere, a coherent food and drink direction, and a concept that works on a limited budget.",
      );
      await message(
        name === "gathering"
          ? "The gathering is in Brooklyn for six people, including Maya. Our total budget is $300. We enjoy Sade, Radiohead and Wong Kar-wai films. Build a connected film, music, food and atmosphere plan. Save an editable plan and invitation, include the headcount, and clearly mark unknown costs and practical details."
          : "This is a small Brooklyn listening-bar pilot with a $3,000 total budget, not a funded construction project. The audience enjoys Sade, Radiohead and Wong Kar-wai films. Save an editable launch brief with linked audience, music, food and drink, atmosphere and space decisions, provisional allocations, risks and unsupported assumptions. Investigate the cultural connections before choosing a direction.",
      );
      result.initial = snapshot(task);
      require(task.agentRun?.acceptance?.status ===
        "satisfied", "initial_acceptance_unsatisfied");
      require(cultural(task).length > 0 &&
        cultural(task).every(
          (e) =>
            e.source === "provider-returned" &&
            ["LIVE", "CACHED"].includes(e.delivery),
        ), "authentic_current_cultural_evidence_missing");
      require(task.work?.decisions.some(
        (d) =>
          d.domain === "music" &&
          d.rationaleKind === "cultural-evidence" &&
          d.freshness !== "stale",
      ), "cultural_music_decision_missing");
      require(documents(task).some(
        (d) => d.content.length > 250 && d.freshness === "current",
      ), "useful_saved_work_missing");
      require(task.work?.critique, "independent_critique_missing");
      const amount = name === "gathering" ? 300 : 3000;
      require(task.work?.budget?.amount === amount &&
        task.brief.constraints.budget === amount, "confirmed_budget_missing");

      if (name === "gathering") {
        require(documents(task).some((d) =>
          /invitation|invite/i.test(
            d.title + " " + (d.fulfills || []).join(" ") + " " + d.content,
          ),
        ), "invitation_missing");
        require(documents(task).some((d) =>
          /\b(six|6)\b/i.test(d.content),
        ), "six_person_constraint_missing");
      } else {
        for (const domain of ["food", "atmosphere", "venue"]) {
          require(task.work.decisions.some(
            (d) => d.domain === domain && d.freshness !== "stale",
          ), `domain_${domain}_missing`);
        }
      }

      await pane("Your work");
      await page.screenshot({
        path: `${output}/${name}-initial-desktop.png`,
        fullPage: true,
        animations: "disabled",
      });
      const beforeEvidence = cultural(task).map((e) => e.id);
      const independent =
        "Keep step-free access as a selection constraint; confirm it with any venue before committing.";
      // Explicit authenticated owner work, not a model-generated or provider-backed assertion.
      await ownerActions([
        {
          kind: "document",
          id: "owner-access",
          title: "Owner access principle",
          content: "Owner-authored independent access requirement.",
          dependencies: [],
          evidenceIds: [],
        },
        { kind: "edit", id: "owner-access", content: independent },
        { kind: "approve", id: "owner-access" },
      ]);
      const protectedWork = structuredClone(
        task.work.documents.find((d) => d.id === "owner-access"),
      );
      const before = structuredClone(task);

      if (name === "gathering") {
        await message(
          "Maya doesn't like that music. Keep our budget and unrelated approved work. Revise only the affected music direction and saved plan.",
        );
        const music = before.work.decisions.find((d) => d.domain === "music");
        const candidates = before.candidates.filter(
          (c) =>
            c.type === "artist" &&
            (music?.candidateIds || before.brief.selected).includes(c.id),
        );

        if (task.agentRun?.acceptance?.status !== "satisfied") {
          require(candidates.length > 0, "no_saved_music_reference_to_clarify");
          await message(
            `By that music I mean ${candidates[0].name}. Maya dislikes ${candidates[0].name}. Find a culturally supported alternative for the group, retain the $300 budget and the approved access principle, and save the revised plan and invitation.`,
          );
        }
      } else {
        await message(
          "Cut the budget in half and remove alcohol. Keep unrelated approved decisions and my exact wording. Revise affected allocations and the saved launch brief, explain the trade-offs, and reuse the cultural evidence that still applies.",
        );
        require(task.work?.budget?.amount === 1500 &&
          task.brief.constraints.budget === 1500, "half_budget_not_retained");
        require(task.work.restrictions?.alcoholFree ===
          true, "alcohol_free_requirement_missing");
        require(cultural(task).every((e) =>
          beforeEvidence.includes(e.id),
        ), "budget_revision_repeated_cultural_discovery");
      }

      result.revision = snapshot(task);
      require(task.agentRun?.acceptance?.status ===
        "satisfied", "revision_acceptance_unsatisfied");
      require(JSON.stringify(
        task.work.documents.find((d) => d.id === "owner-access"),
      ) === JSON.stringify(protectedWork), "approved_manual_work_changed");
      require(task.work.decisions.some((d) =>
        before.work.decisions.some(
          (old) =>
            old.id === d.id &&
            (d.value !== old.value || d.estimatedCost !== old.estimatedCost),
        ),
      ), "no_dependent_decision_changed");
      require(documents(task).some(
        (d) =>
          documents(before).some(
            (old) => old.id === d.id && old.content !== d.content,
          ) ||
          (d.id !== "document:owner-access" &&
            !documents(before).some((old) => old.id === d.id)),
      ), "no_revised_saved_artifact");
      const saved = structuredClone(task);
      await page.reload();
      task = await readTask();
      require(JSON.stringify(task.work) ===
        JSON.stringify(saved.work), "reload_work_changed");
      require(JSON.stringify(task.evidence) ===
        JSON.stringify(saved.evidence), "reload_evidence_changed");
      require(task.brief.constraints.budget ===
        saved.brief.constraints.budget, "reload_budget_changed");
      await pane("Your work");
      await page.screenshot({
        path: `${output}/${name}-revision-desktop.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await pane("Your work");
      await page.screenshot({
        path: `${output}/${name}-revision-mobile.png`,
        fullPage: true,
        animations: "disabled",
      });
      result.checks = {
        authenticEvidence: true,
        savedWork: true,
        independentCritique: true,
        selectiveRevision: true,
        protectedOwnerWork: true,
        reload: true,
      };
      result.passed = true;
    } catch (error) {
      result.failure = String(error.message)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 100);

      if (task) {
        result.lastSaved = snapshot(await readTask().catch(() => task));
      }

      await page
        .screenshot({ path: `${output}/${name}-blocked.png`, fullPage: true })
        .catch(() => {});
    } finally {
      await writeReport();
      await context.close();
    }

    // Avoid buying another long journey from an unavailable provider or broken execution path.
    if (!result.passed) {
      break;
    }
  }

  report.passed =
    report.journeys.length === names.length &&
    report.journeys.every((j) => j.passed);
} finally {
  await writeReport();
  await browser.close();
  console.log("LIVE_EXPERIENCE_REPORT", JSON.stringify(report));
}

if (!report.passed) {
  process.exitCode = 1;
}
