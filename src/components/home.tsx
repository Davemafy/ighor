"use client";

import { ArrowLeft, ArrowUpRight, History, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { TaskAction } from "@/core/contracts";
import { useWorkspace } from "./use-workspace";
import { DiscoveryComposer } from "./discovery/composer";
import { DiscoveryLaunchpad } from "./discovery/launchpad";
import { DiscoveryResults } from "./discovery/results";
import { DiscoveryDialog } from "./discovery/dialog";

export function Home() {
  const workspace = useWorkspace();
  const [screen, setScreen] = useState<"auto" | "home" | "result">("auto");
  const [prompt, setPrompt] = useState("");
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const showingHome =
    screen === "home" || (screen === "auto" && !workspace.task?.brief.goal);

  async function begin(action: TaskAction) {
    if (!workspace.task || workspace.isBusy) {
      return;
    }

    setScreen("result");
    setPrompt("");
    resultRef.current?.scrollIntoView({ behavior: "instant" });
    await workspace.sendTurn(action);
  }

  async function startFresh() {
    if (workspace.isBusy) {
      return;
    }

    await workspace.createWorkspace();
    setScreen("home");
    setPrompt("");
    promptRef.current?.focus();
  }

  async function openHistory() {
    setHistoryVisible(true);
    setHistoryError("");

    try {
      await workspace.loadHistory();
    } catch {
      setHistoryError(
        "Your spaces could not load. Close this window and try again.",
      );
    }
  }

  async function resume(id: string) {
    try {
      if (!(await workspace.openWorkspace(id))) {
        setHistoryError("This discovery is no longer available.");

        return;
      }

      setHistoryVisible(false);
      setScreen("result");
    } catch {
      setHistoryError("This discovery could not open. Please try again.");
    }
  }

  return (
    <div className="ig-app" ref={resultRef}>
      <a className="ig-skip" href="#igor-main">
        Skip to content
      </a>
      <header className="ig-header">
        <button
          className="ig-brand"
          type="button"
          onClick={() => void startFresh()}
          aria-label="Igor home"
          disabled={workspace.isBusy}
        >
          <span className="ig-emblem" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          igor<span className="ig-brand-dot">.</span>
        </button>
        <span className="ig-header-note">
          A little taste. A whole new world.
        </span>
        <nav aria-label="Main navigation">
          <button
            className="ig-spaces-button"
            type="button"
            onClick={() => void openHistory()}
            disabled={workspace.isBusy}
          >
            <History size={17} />
            <span>Your spaces</span>
          </button>
          <button
            className="ig-new-button"
            type="button"
            onClick={() => void startFresh()}
            disabled={workspace.isBusy}
          >
            <Plus size={17} />
            <span>New discovery</span>
          </button>
        </nav>
      </header>
      <main
        id="igor-main"
        className={showingHome ? "ig-launch-main" : "ig-result-main"}
      >
        {showingHome ? (
          <DiscoveryLaunchpad
            onBegin={(action) => void begin(action)}
            disabled={workspace.isBusy || !workspace.task}
            composer={
              <DiscoveryComposer
                value={prompt}
                onChange={setPrompt}
                onSubmit={() =>
                  void begin({ type: "message", text: prompt.trim() })
                }
                inputRef={promptRef}
                disabled={workspace.isBusy || !workspace.task}
                busy={workspace.isBusy}
              />
            }
          />
        ) : (
          <>
            <div className="ig-result-toolbar">
              <button
                type="button"
                onClick={() => void startFresh()}
                disabled={workspace.isBusy}
              >
                <ArrowLeft size={16} /> Discover
              </button>
              <span>Saved in your space</span>
            </div>
            {workspace.task && (
              <DiscoveryResults
                key={workspace.task.id}
                task={workspace.task}
                busy={workspace.isBusy}
                executionMessage={workspace.executionMessage}
                onTurn={(action) => void begin(action)}
              />
            )}
          </>
        )}
        {workspace.errorMessage && (
          <div className="ig-error" role="alert">
            <p>{workspace.errorMessage}</p>
            <button
              type="button"
              onClick={() => void startFresh()}
              disabled={workspace.isBusy}
            >
              Retry workspace
            </button>
          </div>
        )}
        {!workspace.task && !workspace.errorMessage && (
          <p className="ig-connecting" role="status">
            Opening your space...
          </p>
        )}
      </main>
      {!showingHome && (
        <div className="ig-followup">
          <DiscoveryComposer
            value={prompt}
            onChange={setPrompt}
            onSubmit={() =>
              void begin({ type: "message", text: prompt.trim() })
            }
            inputRef={promptRef}
            disabled={workspace.isBusy || !workspace.task}
            busy={workspace.isBusy}
            compact
          />
        </div>
      )}
      <footer className="ig-footer">
        <span>Curiosity, connected.</span>
        <span>
          Powered by Qloo <span aria-hidden="true">↗</span>
        </span>
        <Link href="/workspace">
          Advanced workspace <ArrowUpRight size={12} />
        </Link>
      </footer>
      <DiscoveryDialog
        open={historyVisible}
        onClose={() => setHistoryVisible(false)}
        title="Your spaces"
      >
        <p className="ig-dialog-intro">
          Good discoveries are worth coming back to.
        </p>
        {historyError && (
          <p role="alert" className="ig-error">
            {historyError}
          </p>
        )}
        {workspace.history.length ? (
          <div className="ig-history-list">
            {workspace.history.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => void resume(item.id)}
              >
                <History size={18} />
                <span>{item.goal || "A new discovery"}</span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <p className="ig-empty">
            Your discoveries will appear here once you begin.
          </p>
        )}
      </DiscoveryDialog>
    </div>
  );
}
