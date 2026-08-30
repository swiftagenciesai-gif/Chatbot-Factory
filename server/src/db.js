import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;
if (connectionString) {
  sql = neon(connectionString);
}

export const hasDatabase = () => sql !== null;

let schemaReady = null;
export const ensureSchema = () => {
  if (!sql) throw new Error('DATABASE_URL is not configured on the server.');
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS widgets (
          id uuid PRIMARY KEY,
          provider text NOT NULL,
          name text NOT NULL,
          system_prompt text NOT NULL,
          primary_color text NOT NULL,
          text_color text NOT NULL,
          website_url text NOT NULL DEFAULT '',
          message_limit integer,
          messages_used integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      // Added after the table already existed in production - ADD COLUMN IF NOT
      // EXISTS keeps this idempotent for tables created before this column existed.
      await sql`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS opening_message text NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6) NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS last_alert_threshold integer NOT NULL DEFAULT 0`;
    })();
  }
  return schemaReady;
};

const toWidget = (row) => ({
  id: row.id,
  provider: row.provider,
  name: row.name,
  systemPrompt: row.system_prompt,
  primaryColor: row.primary_color,
  textColor: row.text_color,
  websiteUrl: row.website_url,
  openingMessage: row.opening_message,
  messageLimit: row.message_limit,
  messagesUsed: row.messages_used,
  costUsd: Number(row.cost_usd),
  lastAlertThreshold: row.last_alert_threshold,
  createdAt: row.created_at
});

export const insertWidget = async (widget) => {
  await ensureSchema();
  const rows = await sql`
    INSERT INTO widgets (id, provider, name, system_prompt, primary_color, text_color, website_url, opening_message, message_limit)
    VALUES (${widget.id}, ${widget.provider}, ${widget.name}, ${widget.systemPrompt}, ${widget.primaryColor}, ${widget.textColor}, ${widget.websiteUrl}, ${widget.openingMessage}, ${widget.messageLimit})
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  `;
  return rows[0] ? toWidget(rows[0]) : null;
};

export const listWidgets = async () => {
  await ensureSchema();
  const rows = await sql`SELECT * FROM widgets ORDER BY created_at DESC`;
  return rows.map(toWidget);
};

export const getWidget = async (id) => {
  await ensureSchema();
  const rows = await sql`SELECT * FROM widgets WHERE id = ${id}`;
  return rows[0] ? toWidget(rows[0]) : null;
};

export const updateWidget = async (id, patch) => {
  await ensureSchema();
  const current = await getWidget(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  // A changed message_limit invalidates any threshold already alerted on,
  // since the percentage basis just changed.
  const resetAlert = patch.messageLimit !== undefined && patch.messageLimit !== current.messageLimit;
  const rows = await sql`
    UPDATE widgets SET
      name = ${next.name},
      system_prompt = ${next.systemPrompt},
      primary_color = ${next.primaryColor},
      text_color = ${next.textColor},
      website_url = ${next.websiteUrl},
      opening_message = ${next.openingMessage},
      message_limit = ${next.messageLimit},
      last_alert_threshold = ${resetAlert ? 0 : current.lastAlertThreshold}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? toWidget(rows[0]) : null;
};

export const deleteWidget = async (id) => {
  await ensureSchema();
  await sql`DELETE FROM widgets WHERE id = ${id}`;
};

export const resetUsage = async (id) => {
  await ensureSchema();
  const rows = await sql`UPDATE widgets SET messages_used = 0, cost_usd = 0, last_alert_threshold = 0 WHERE id = ${id} RETURNING *`;
  return rows[0] ? toWidget(rows[0]) : null;
};

export const incrementUsage = async (id, costUsd) => {
  await ensureSchema();
  const rows = await sql`UPDATE widgets SET messages_used = messages_used + 1, cost_usd = cost_usd + ${costUsd || 0} WHERE id = ${id} RETURNING *`;
  return rows[0] ? toWidget(rows[0]) : null;
};

export const updateAlertThreshold = async (id, threshold) => {
  await ensureSchema();
  await sql`UPDATE widgets SET last_alert_threshold = ${threshold} WHERE id = ${id}`;
};
