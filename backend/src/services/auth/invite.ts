import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { invite } from '../db/schema.js';

export type InviteRow = typeof invite.$inferSelect;

const DEFAULT_TTL_DAYS = 14;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Issue a new invite. Returns the raw code (shown to the admin once) and
 * the stored row. Only the SHA-256 hash of the code is persisted.
 */
export function createInvite(
  createdBy: string,
  ttlDays: number = DEFAULT_TTL_DAYS,
): {
  code: string;
  row: InviteRow;
} {
  const db = getDb();
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const row: typeof invite.$inferInsert = {
    id: randomUUID(),
    codeHash: hashCode(code),
    createdBy,
    createdAt: now,
    expiresAt,
    usedAt: null,
    usedBy: null,
  };
  const [inserted] = db.insert(invite).values(row).returning().all();
  return {
    code,
    row: inserted,
  };
}

/**
 * Atomically claim an invite by its raw code. Returns the row on success,
 * or null if the code is unknown, expired, or already used.
 *
 * The claim is intentionally split from "associate with user": this lets the
 * caller validate-and-lock the invite *before* creating the user, then back-
 * fill `usedBy` once the user id is known.
 */
export function claimInvite(code: string): InviteRow | null {
  const db = getDb();
  const codeHash = hashCode(code);
  const now = new Date();

  const updated = db
    .update(invite)
    .set({
      usedAt: now,
    })
    .where(and(eq(invite.codeHash, codeHash), isNull(invite.usedAt), gt(invite.expiresAt, now)))
    .returning()
    .all();

  return updated[0] ?? null;
}

/**
 * Set the `usedBy` field on a previously-claimed invite.
 */
export function attachInviteUser(inviteId: string, userId: string): void {
  const db = getDb();
  db.update(invite)
    .set({
      usedBy: userId,
    })
    .where(eq(invite.id, inviteId))
    .run();
}

/**
 * Roll back a claim made via `claimInvite` — used when the subsequent
 * sign-up step failed and we want the code to remain redeemable.
 */
export function releaseInvite(inviteId: string): void {
  const db = getDb();
  db.update(invite)
    .set({
      usedAt: null,
      usedBy: null,
    })
    .where(eq(invite.id, inviteId))
    .run();
}

export function listInvites(): InviteRow[] {
  const db = getDb();
  return db
    .select()
    .from(invite)
    .orderBy(sql`createdAt desc`)
    .all();
}

export function deleteInvite(id: string): boolean {
  const db = getDb();
  const result = db.delete(invite).where(eq(invite.id, id)).run();
  return result.changes > 0;
}
