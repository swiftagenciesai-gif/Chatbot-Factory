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
    schemaReady = sql`
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
  messageLimit: row.message_limit,
  messagesUsed: row.messages_used,
  createdAt: row.created_at
});

export const insertWidget = async (widget) => {
  await ensureSchema();
  const rows = await sql`
    INSERT INTO widgets (id, provider, name, system_prompt, primary_color, text_color, website_url, message_limit)
    VALUES (${widget.id}, ${widget.provider}, ${widget.name}, ${widget.systemPrompt}, ${widget.primaryColor}, ${widget.textColor}, ${widget.websiteUrl}, ${widget.messageLimit})
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
  const rows = await sql`
    UPDATE widgets SET
      name = ${next.name},
      system_prompt = ${next.systemPrompt},
      primary_color = ${next.primaryColor},
      text_color = ${next.textColor},
      website_url = ${next.websiteUrl},
      message_limit = ${next.messageLimit}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? toWidget(rows[0]) : null;
};

export const deleteWidget = async (id) => {
  await ensureSchema();
  await sql`DELETE FROM widgets WHERE id = ${id}`;
};

export const incrementUsage = async (id) => {
  await ensureSchema();
  await sql`UPDATE widgets SET messages_used = messages_used + 1 WHERE id = ${id}`;
};
