import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Regression coverage for the CHECKIN-05 replacement transaction fix.
 *
 * The deployed replace_graduation_ticket pointed replaced_by_ticket_id at
 * the new ticket before that row existed, violating the self-referencing
 * foreign key (SQLSTATE 23503) and failing every replacement with an
 * unhandled 500. These tests pin the corrected statement order inside the
 * corrective migration and confirm the deployed migration is untouched.
 */

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

let fix = "";
let body = "";

beforeAll(() => {
  const files = readdirSync(migrationsDir).filter((file) =>
    file.endsWith("_fix_ticket_replacement_transaction.sql")
  );
  expect(files).toHaveLength(1);
  fix = readFileSync(join(migrationsDir, files[0]), "utf8").toLowerCase();
  body = fix.slice(fix.indexOf("begin"), fix.indexOf("$$;"));
});

describe("ticket replacement transaction fix migration", () => {
  it("leaves the deployed CHECKIN-05 migration untouched", () => {
    const files = readdirSync(migrationsDir);
    expect(
      files.some((file) => file.endsWith("_extend_secure_ticket_generation.sql"))
    ).toBe(true);
    // The corrective migration only redefines the one function.
    expect(fix).toContain(
      "create or replace function public.replace_graduation_ticket"
    );
    expect(fix).not.toContain("create table");
    expect(fix).not.toContain("alter table");
    expect(fix).not.toContain("drop ");
    expect(fix).not.toContain("delete from");
    expect(fix).not.toContain("truncate");
  });

  it("retires the old ticket before inserting the new active ticket", () => {
    const retire = body.indexOf("set status = 'replaced'");
    const insert = body.indexOf("insert into public.graduation_tickets");
    expect(retire).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(retire).toBeLessThan(insert);
  });

  it("keeps replaced_by_ticket_id null until the new ticket row exists", () => {
    const nullFirst = body.indexOf("replaced_by_ticket_id = null");
    const insert = body.indexOf("insert into public.graduation_tickets");
    const pointer = body.indexOf("replaced_by_ticket_id = p_new_ticket_id");
    expect(nullFirst).toBeGreaterThan(-1);
    expect(pointer).toBeGreaterThan(-1);
    // Null assignment happens in the retire step, before the insert; the
    // real pointer is only set after the insert, so the foreign key
    // graduation_tickets_replaced_by_ticket_id_fkey cannot fire.
    expect(nullFirst).toBeLessThan(insert);
    expect(pointer).toBeGreaterThan(insert);
  });

  it("inserts the new ticket as active with server-provided identifiers", () => {
    expect(body).toContain("p_new_ticket_id, v_ticket.registration_id");
    expect(body).toContain("'active', now()");
  });

  it("writes the replaced activity-log entry after both ticket writes", () => {
    const pointer = body.indexOf("replaced_by_ticket_id = p_new_ticket_id");
    const log = body.indexOf("insert into public.ticket_activity_log");
    expect(log).toBeGreaterThan(pointer);
    expect(body).toContain("'replaced',");
  });

  it("locks the ticket and registration rows and requires active status", () => {
    const locks = body.split("for update").length - 1;
    expect(locks).toBeGreaterThanOrEqual(2);
    expect(body).toContain("if v_ticket.status <> 'active' then");
    expect(body).toContain("'ticket_not_active'");
    expect(body).toContain("'registration_not_eligible'");
  });

  it("verifies the acting user is an active administrator first", () => {
    const adminCheck = body.indexOf("role = 'administrator'");
    const firstWrite = body.indexOf("update public.graduation_tickets");
    expect(adminCheck).toBeGreaterThan(-1);
    expect(adminCheck).toBeLessThan(firstWrite);
    expect(body).toContain("'not_authorized'");
  });

  it("validates the reason and generated values before any write", () => {
    const reason = body.indexOf("'invalid_reason'");
    const values = body.indexOf("'invalid_replacement'");
    const firstWrite = body.indexOf("update public.graduation_tickets");
    expect(reason).toBeGreaterThan(-1);
    expect(values).toBeGreaterThan(-1);
    expect(reason).toBeLessThan(firstWrite);
    expect(values).toBeLessThan(firstWrite);
  });

  it("turns constraint races into a structured conflict that rolls back", () => {
    // A plpgsql exception handler rolls back every change in the block,
    // so a failed insertion also rolls back the old-ticket update.
    expect(body).toContain("when unique_violation or foreign_key_violation then");
    expect(body).toContain("'replacement_conflict'");
  });

  it("returns only safe ticket IDs, codes and statuses", () => {
    const success = body.slice(body.indexOf("'ok', true"));
    expect(success).toContain("'ticket_code'");
    expect(success).toContain("'status'");
    expect(success).not.toContain("token_hash");
    expect(success).not.toContain("p_new_token_hash");
  });

  it("keeps security definer, a fixed safe search_path and revoked execution", () => {
    expect(fix).toContain("security definer");
    expect(fix).toContain("set search_path = ''");
    for (const roleName of ["public", "anon", "authenticated"]) {
      expect(fix).toContain(
        "revoke all on function public.replace_graduation_ticket" +
          `(uuid, uuid, uuid, text, text, integer, text, text) from ${roleName}`
      );
    }
  });
});
