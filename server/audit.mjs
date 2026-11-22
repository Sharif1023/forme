import { randomUUID } from "node:crypto";
import { query } from "./db/pool.mjs";

export async function audit(actor, action, entityType, entityId, metadata = {}, connection) {
  await query(
    "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,metadata_json,ip_address) VALUES (?,?,?,?,?,?,?)",
    [
      randomUUID(),
      actor?.id || null,
      action,
      entityType,
      entityId || null,
      JSON.stringify(metadata),
      actor?.ip || null,
    ],
    connection,
  );
}
export const jsonValue = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  return typeof value === "string" ? JSON.parse(value) : value;
};
