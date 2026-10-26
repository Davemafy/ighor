"use client";

import { useEffect, useState, useRef } from "react";

export function AccountPanel() {
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [action, setAction] = useState("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/account")
      .then(async (response) => {
        const data = await response.json();

        if (active) {
          setAccount(data.account);
        }
      })
      .catch(() => {
        if (active) {
          setError("Could not load account state.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(logout = false) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        "/api/account",
        logout
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, username, password }),
            },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setAccount(data.account ?? null);
      setPassword("");

      if (logout || action === "login") {
        localStorage.removeItem("igor-task");
        window.location.reload();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Account action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-panel">
      <h3>
        {account
          ? `Your account · ${account.username}`
          : "Keep access across sessions"}
      </h3>
      {error && <p role="alert">{error}</p>}
      {account ? (
        <>
          <p>
            Workspaces, approved taste memory and collections belong to this
            account. A private review link still identifies a link holder, not a
            verified person.
          </p>
          <button disabled={busy} onClick={() => void submit(true)}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p>
            Create a local account to retain access to this session&apos;s work.
            No email or password recovery service is connected. Signing into an
            existing account switches workspaces; export anonymous work first.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="account-action">Account action</label>
            <select
              id="account-action"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setConfirm(false);
              }}
            >
              <option value="register">
                Create account and keep this work
              </option>
              <option value="login">Sign into an existing account</option>
            </select>
            <label htmlFor="account-username">Username</label>
            <input
              id="account-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}"
              autoComplete="username"
              required
            />
            <label htmlFor="account-password">
              Password · at least 12 characters
            </label>
            <input
              id="account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              maxLength={128}
              autoComplete={
                action === "register" ? "new-password" : "current-password"
              }
              required
            />
            {action === "login" && (
              <label className="reference-choice">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                I understand that signing in switches to that account&apos;s
                workspaces.
              </label>
            )}
            <button
              disabled={
                busy ||
                !username ||
                password.length < 12 ||
                (action === "login" && !confirm)
              }
            >
              {action === "register" ? "Create private account" : "Sign in"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();

    return () => dialog?.close();
  }, []);

  return (
    <dialog
      className="account-dialog"
      ref={ref}
      onCancel={onClose}
      aria-label="Account"
    >
      <button type="button" onClick={onClose} aria-label="Close account">
        Close
      </button>
      <AccountPanel />
    </dialog>
  );
}
