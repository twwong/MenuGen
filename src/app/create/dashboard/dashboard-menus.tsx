"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteFixtureMenuAction,
  deleteManagedMenuAction,
} from "@/app/create/actions";

interface MenuSummary {
  id: string;
  state: string;
  targetLanguage: string;
  updatedAt: string;
  expiresAt: string | null;
  completedItemCount: number;
  totalItemCount: number;
}

export function DashboardMenus({
  menus,
  backend,
}: {
  menus: readonly MenuSummary[];
  backend: "fixture" | "managed";
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove(menuId: string) {
    if (
      !window.confirm("Delete this private menu and all of its result images?")
    ) {
      return;
    }
    setError(null);
    setDeletingId(menuId);
    startTransition(async () => {
      try {
        if (backend === "managed") {
          await deleteManagedMenuAction(menuId);
        } else {
          await deleteFixtureMenuAction(menuId);
        }
        router.refresh();
      } catch {
        setError("The menu could not be deleted. Please try again.");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <section className="dashboard-menus" aria-labelledby="menus-title">
      <div className="dashboard-menus__title">
        <h2 id="menus-title">Menus</h2>
        <span>{menus.length} total</span>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {menus.length === 0 ? (
        <div className="dashboard-empty">
          <p>No private menus yet.</p>
          <Link className="secondary-link" href="/create">
            Read your first menu
          </Link>
        </div>
      ) : (
        <ol>
          {menus.map((menu, index) => (
            <li className="dashboard-menu" key={menu.id}>
              <div>
                <p className="folio">
                  Menu {String(index + 1).padStart(2, "0")}
                </p>
                <h3>{stateLabel(menu.state)}</h3>
                <p>
                  {menu.completedItemCount} of {menu.totalItemCount} items ·
                  target {menu.targetLanguage}
                </p>
                <small>
                  {menu.expiresAt
                    ? `Expires ${formatDate(menu.expiresAt)}`
                    : `Updated ${formatDate(menu.updatedAt)}`}
                </small>
              </div>
              <div className="dashboard-menu__actions">
                <Link href={menuHref(menu)}>Open</Link>
                <button
                  disabled={isPending && deletingId === menu.id}
                  onClick={() => remove(menu.id)}
                  type="button"
                >
                  {deletingId === menu.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function menuHref(menu: MenuSummary) {
  if (menu.state === "ready") return `/create/${menu.id}/result`;
  if (menu.state === "review_ready") return `/create/${menu.id}/review`;
  if (["generation_ready", "generating"].includes(menu.state)) {
    return `/create/${menu.id}/generate`;
  }
  return `/create/${menu.id}/processing`;
}

function stateLabel(state: string) {
  const labels: Record<string, string> = {
    uploading: "Uploading",
    preflight: "Checking pages",
    extracting: "Reading menu",
    review_ready: "Needs review",
    generation_ready: "Ready for images",
    generating: "Generating images",
    ready: "Complete",
    failed: "Needs attention",
  };
  return labels[state] ?? "Processing";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
