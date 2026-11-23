import { failure } from "./data";
import { useState } from "react";
import { api } from "@/lib/commerce/api";
import type { AdminUser } from "./types";
import { PageHead, ErrorBox } from "./shared";

export function AdminAccount({ admin, onChanged }: { admin: AdminUser; onChanged: () => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/admin/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onChanged();
    } catch (reason) {
      setError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead title="My account" description="Keep your workspace access up to date." />
      <div className="admin-two-col">
        <section className="admin-card">
          <h2>Change your password</h2>
          <p className="admin-section-note">
            Use at least 12 characters. Changing your password signs you out of all devices.
          </p>
          <ErrorBox error={error} />
          <form className="admin-stack" onSubmit={save}>
            <label className="admin-field">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label className="admin-field">
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={200}
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
              />
            </label>
            <label className="admin-field">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={200}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <div className="admin-form-footer">
              <button className="admin-button admin-button-primary" disabled={busy}>
                {busy ? "Changing password…" : "Change password"}
              </button>
            </div>
          </form>
        </section>
        <section className="admin-card">
          <h2>Your profile</h2>
          <dl className="admin-key-values">
            <dt>Name</dt>
            <dd>{admin.name}</dd>
            <dt>Email</dt>
            <dd>{admin.email}</dd>
            <dt>Access</dt>
            <dd className="admin-capitalize">{admin.role}</dd>
          </dl>
          <p className="admin-section-note">
            The store owner can update staff names, email addresses and access levels in Team
            access.
          </p>
        </section>
      </div>
    </>
  );
}
