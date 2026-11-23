import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/commerce/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function PageHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-page-head">
      <div>
        {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="admin-empty" role="status">
      <span className="admin-spinner" /> <p>Loading your store data…</p>
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return error ? (
    <div className="admin-alert" role="alert">
      {error}
      {retry && (
        <button type="button" className="admin-small-button" onClick={retry}>
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  ) : null;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="admin-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="admin-app admin-modal-content">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Pagination({
  page,
  setPage,
  hasNext,
  total,
}: {
  page: number;
  setPage: (value: number) => void;
  hasNext: boolean;
  total?: number;
}) {
  return (
    <div className="admin-pagination">
      {total !== undefined && <span>{total} records</span>}
      <button
        type="button"
        className="admin-small-button"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        type="button"
        className="admin-small-button"
        disabled={!hasNext}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const good = ["paid", "delivered", "active", "confirmed", "ready"].includes(value),
    bad = ["cancelled", "failed", "rejected", "refund_pending", "inactive"].includes(value),
    warn = ["pending", "pending_review", "unpaid", "processing"].includes(value);
  return (
    <span
      className={`admin-pill${good ? " admin-pill-good" : bad ? " admin-pill-bad" : warn ? " admin-pill-warn" : ""}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
