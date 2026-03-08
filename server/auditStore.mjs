import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";
import { migrateAuditLogs } from "./auditMigrations.mjs";

export const AUDIT_ACTIONS = {
  PROMPT_UPDATED: "prompt_updated",
  PROMPT_GENERATED: "prompt_generated",
  RERUN_CREATED: "rerun_created",
  RERUN_TRIGGERED: "rerun_triggered",
  FINAL_SELECTED: "final_selected",
  EXPORT_COMPLETED: "export_completed",
  FINAL_EXPORTED: "final_exported",
  DELIVERED: "delivered",
  ARCHIVED: "archived",
  ARCHIVE_UPDATED: "archive_updated",
  MANUAL_SLA_EDIT: "manual_sla_edit",
  SLA_RECOMPUTED: "sla_recomputed",
  FIRST_OUTPUT_CREATED: "first_output_created",
  TESTIMONIAL_GENERATED: "testimonial_generated",
  TESTIMONIAL_UPDATED: "testimonial_updated",
  PROOF_PACK_GENERATED: "proof_pack_generated",
  PROOF_PACK_UPDATED: "proof_pack_updated",
  QUOTE_CHANGED: "quote_changed",
  STATUS_CHANGED: "status_changed",
  JOB_CREATED: "job_created",
};

function openDb(dbPath) {
  return new DatabaseSync(getDocumentsDbPath(dbPath));
}

function parseMetadata(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function normalizeEntry(row) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action_type: row.action_type,
    actor: row.actor,
    metadata: parseMetadata(row.metadata_json),
    created_at: row.created_at,
  };
}

function asIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function initializeAuditStore({ dbPath } = {}) {
  await migrateAuditLogs({ dbPath });
}

export function appendAuditLog(entry, { dbPath, dedupeWindowMs = 4000 } = {}) {
  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString();
    const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
    const metadataJson = JSON.stringify(metadata);
    const entityType = String(entry?.entity_type || "").trim();
    const entityId = String(entry?.entity_id || "").trim();
    const actionType = String(entry?.action_type || "").trim();
    const actor = String(entry?.actor || "system").trim() || "system";

    if (!entityType || !entityId || !actionType) {
      return null;
    }

    const latest = db
      .prepare(
        `
        SELECT id, metadata_json, created_at
        FROM audit_logs
        WHERE entity_type = ? AND entity_id = ? AND action_type = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(entityType, entityId, actionType);

    if (latest) {
      const prevTs = asIsoDate(latest.created_at);
      const prevMs = prevTs ? Date.parse(prevTs) : 0;
      const nowMs = Date.parse(now);
      if (
        Number.isFinite(prevMs) &&
        Number.isFinite(nowMs) &&
        nowMs - prevMs <= dedupeWindowMs &&
        String(latest.metadata_json || "{}") === metadataJson
      ) {
        return latest.id;
      }
    }

    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO audit_logs (
        id, entity_type, entity_id, action_type, actor, metadata_json, created_at
      ) VALUES (
        @id, @entity_type, @entity_id, @action_type, @actor, @metadata_json, @created_at
      )
      `
    ).run({
      id,
      entity_type: entityType,
      entity_id: entityId,
      action_type: actionType,
      actor,
      metadata_json: metadataJson,
      created_at: now,
    });

    return id;
  } finally {
    db.close();
  }
}

export function listAuditLogsForEntity(
  { entity_type, entity_id, limit = 100 },
  { dbPath } = {}
) {
  const db = openDb(dbPath);
  try {
    const rows = db
      .prepare(
        `
        SELECT
          id, entity_type, entity_id, action_type, actor, metadata_json, created_at
        FROM audit_logs
        WHERE entity_type = ? AND entity_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(
        String(entity_type || ""),
        String(entity_id || ""),
        Math.max(1, Math.min(200, Number(limit) || 100))
      );
    return rows.map(normalizeEntry);
  } finally {
    db.close();
  }
}
