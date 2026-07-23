import Link from "next/link";
import { Archive } from "lucide-react";
import {
  ACTIVE_DELIVERY_PATH,
  ARCHIVED_AUTOMATION_LABEL,
  ARCHIVED_AUTOMATION_NOTICE,
} from "../retirement";

/**
 * Banner shown on every Google Apps Script distribution page. The pages
 * still work and still show their historical records; this makes clear
 * that they are not the production workflow any more.
 */
export function ArchivedAutomationBanner() {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-lg border-2 border-gold bg-cream p-4"
    >
      <Archive aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-navy/70" />
      <div>
        <p className="font-semibold text-navy">
          {ARCHIVED_AUTOMATION_LABEL}
        </p>
        <p className="mt-1 text-sm text-navy/75">
          {ARCHIVED_AUTOMATION_NOTICE}
        </p>
        <Link
          href={ACTIVE_DELIVERY_PATH}
          className="mt-2 inline-block text-sm font-semibold text-navy underline"
        >
          Open the Manual Delivery Desk
        </Link>
      </div>
    </div>
  );
}
