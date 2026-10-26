"use client";

import { useEffect, useState } from "react";
import type { Task, TaskAction } from "@/core/contracts";
import {
  createWorkspace as requestNewWorkspace,
  fetchWorkspace,
  fetchWorkspaceHistory,
  readTurnEvents,
  submitTurn,
  TurnRequestError,
  type WorkspaceSummary,
} from "./workspace-api";

export type WorkspaceView =
  "programme" | "options" | "invitation" | "evidence" | "connections" | "keep";

const savedWorkspaceKey = "igor-task";

export function useWorkspace() {
  const [task, setTask] = useState<Task | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeView, setActiveView] = useState<WorkspaceView>("programme");
  const [executionMessage, setExecutionMessage] = useState("");
  const [history, setHistory] = useState<WorkspaceSummary[]>([]);

  useEffect(() => {
    let active = true;

    async function restoreWorkspace() {
      try {
        const savedId = localStorage.getItem(savedWorkspaceKey);
        const savedTask = savedId ? await fetchWorkspace(savedId) : null;
        const workspace = savedTask ?? (await requestNewWorkspace());

        if (active) {
          setTask(workspace);
          localStorage.setItem(savedWorkspaceKey, workspace.id);
        }
      } catch {
        if (active) {
          setErrorMessage(
            "The local workspace could not start. Refresh to retry.",
          );
        }
      }
    }

    void restoreWorkspace();

    return () => {
      active = false;
    };
  }, []);

  async function createWorkspace() {
    setIsBusy(true);
    setErrorMessage("");

    try {
      const workspace = await requestNewWorkspace();
      setTask(workspace);
      localStorage.setItem(savedWorkspaceKey, workspace.id);
      setActiveView("programme");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function openWorkspace(id: string) {
    const workspace = await fetchWorkspace(id);

    if (!workspace) {
      return false;
    }

    setTask(workspace);
    localStorage.setItem(savedWorkspaceKey, id);

    return true;
  }

  async function loadHistory() {
    const workspaces = await fetchWorkspaceHistory();

    if (workspaces) {
      setHistory(workspaces);
    }
  }

  async function sendTurn(action: TaskAction) {
    const currentTask = task;

    if (!currentTask || isBusy) {
      return;
    }

    setIsBusy(true);
    setErrorMessage("");
    setExecutionMessage("Validating the brief…");

    try {
      const response = await submitTurn(currentTask, action);

      for await (const event of readTurnEvents(response)) {
        if (event.task) {
          setTask(event.task);
        }

        if (event.type === "done" && event.task?.brief.outcome) {
          setActiveView("programme");
        } else if (
          event.type === "done" &&
          event.task?.brief.targetType === "place"
        ) {
          setActiveView("connections");
        }

        if (event.type === "action") {
          setExecutionMessage(event.message ?? "");
        }

        if (event.type === "error") {
          if (event.code === "conflict") {
            await openWorkspace(currentTask.id);
          }

          setErrorMessage(event.message ?? "Action rejected.");
        }
      }
    } catch (error) {
      let message =
        error instanceof Error ? error.message : "The action could not finish.";

      if (error instanceof TurnRequestError && error.needsRefresh) {
        try {
          await openWorkspace(currentTask.id);
        } catch {
          message += " Refresh the page to load the latest workspace.";
        }
      }

      setErrorMessage(message);
    } finally {
      setIsBusy(false);
      setExecutionMessage("");
    }
  }

  return {
    task,
    acceptTask: setTask,
    isBusy,
    errorMessage,
    setErrorMessage,
    activeView,
    setActiveView,
    executionMessage,
    history,
    loadHistory,
    createWorkspace,
    openWorkspace,
    sendTurn,
  };
}
