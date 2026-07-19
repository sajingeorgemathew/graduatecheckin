"use client";

/**
 * Accessible modal overlay that hosts the detail, manual-arrival and
 * correction workspaces. The workspaces previously rendered inline far below
 * the search results, so on a phone an opened panel appeared off screen and
 * looked as though nothing happened. Presenting them in a centered, scrollable
 * dialog with a backdrop makes each action unmistakably open on mobile and
 * desktop. Escape and a backdrop click close it; the panel itself scrolls when
 * tall so the page body never scrolls horizontally.
 */

import { useEffect, useRef } from "react";

interface WorkspaceOverlayProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function WorkspaceOverlay({
  title,
  onClose,
  children,
}: WorkspaceOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Move focus into the panel so the opened workspace is announced.
    panelRef.current?.focus();
    // Prevent the page body from scrolling behind the dialog.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/50 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-2xl outline-none"
      >
        {children}
      </div>
    </div>
  );
}
