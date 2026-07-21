import "server-only";

/**
 * Private Supabase Storage access for generated PDFs.
 *
 * Every operation here runs with the service-role client on the server. The
 * service-role key is never sent to the browser, and no permanent public URL
 * for a document is ever produced: administrators receive either streamed
 * bytes from an authenticated route or a short-lived signed URL created
 * here.
 *
 * Object paths are opaque and built from identifiers alone, so a graduate
 * name or email address never appears in a storage path. A PDF object is
 * written exactly once and never overwritten: a new document version always
 * takes a new object path.
 */

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  SIGNED_URL_TTL_SECONDS,
  TICKET_DOCUMENT_BUCKET,
  TICKET_DOCUMENT_MIME_TYPE,
} from "./constants";

function storage() {
  return getSupabaseAdminClient().storage.from(TICKET_DOCUMENT_BUCKET);
}

/** Reports the operation name only, so no path or credential can leak. */
function storageError(operation: string): Error {
  return new Error(`Ticket document storage operation failed: ${operation}`);
}

/**
 * Uploads PDF bytes to a unique object path.
 *
 * upsert stays false so an existing object is never overwritten. If the
 * path already exists the upload fails, which is the correct outcome: it
 * means a document with that identifier was already finalized.
 */
export async function uploadTicketDocument(
  storagePath: string,
  bytes: Uint8Array
): Promise<void> {
  const { error } = await storage().upload(storagePath, bytes, {
    contentType: TICKET_DOCUMENT_MIME_TYPE,
    upsert: false,
  });
  if (error) {
    throw storageError("upload document");
  }
}

/**
 * Best-effort cleanup of an uploaded object after database finalization
 * failed. Storage and Postgres do not share a transaction, so an orphaned
 * object is possible; this removes it when it can. A failure here is
 * deliberately swallowed: the caller is already reporting the finalization
 * error, and a leftover private object is harmless.
 */
export async function removeTicketDocumentQuietly(
  storagePath: string
): Promise<boolean> {
  try {
    const { error } = await storage().remove([storagePath]);
    return !error;
  } catch {
    return false;
  }
}

/** Downloads the exact stored bytes of a document. */
export async function downloadTicketDocument(
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await storage().download(storagePath);
  if (error || data === null) {
    throw storageError("download document");
  }
  return Buffer.from(await data.arrayBuffer());
}

/** True when the object exists in the private bucket. */
export async function ticketDocumentExists(
  storagePath: string
): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf("/");
  const folder = lastSlash < 0 ? "" : storagePath.slice(0, lastSlash);
  const name = lastSlash < 0 ? storagePath : storagePath.slice(lastSlash + 1);
  const { data, error } = await storage().list(folder, {
    search: name,
    limit: 100,
  });
  if (error) {
    return false;
  }
  return (data ?? []).some((entry) => entry.name === name);
}

/**
 * Creates a short-lived signed URL for an administrator download. The URL
 * expires quickly and is produced only inside an authenticated server
 * route; it is never stored and never treated as a stable address.
 */
export async function createTicketDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<string> {
  const { data, error } = await storage().createSignedUrl(
    storagePath,
    expiresInSeconds
  );
  if (error || data === null) {
    throw storageError("create signed url");
  }
  return data.signedUrl;
}

/** Reads the bucket's configuration, used by the verification script. */
export async function describeTicketDocumentBucket(): Promise<{
  exists: boolean;
  isPublic: boolean;
  allowedMimeTypes: string[] | null;
  fileSizeLimit: number | null;
}> {
  const { data, error } = await getSupabaseAdminClient()
    .storage.getBucket(TICKET_DOCUMENT_BUCKET);
  if (error || data === null) {
    return {
      exists: false,
      isPublic: false,
      allowedMimeTypes: null,
      fileSizeLimit: null,
    };
  }
  return {
    exists: true,
    isPublic: data.public === true,
    allowedMimeTypes: data.allowed_mime_types ?? null,
    fileSizeLimit: data.file_size_limit ?? null,
  };
}
