/**
 * The top-level statements of a migration file, for one decision: can the file
 * be run again inside a transaction that is rolled back, and leave nothing?
 *
 * This is a lexer, not a parser. It knows where comments, strings, quoted
 * identifiers and dollar-quoted bodies begin and end, so the `end;` closing a
 * function body is not mistaken for a top-level `end;`, which would commit.
 */

const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

/**
 * @typedef {object} Statement
 * @property {string} code     The statement with comments blanked, without its `;`.
 * @property {string} keyword  Its first word, lowercased.
 * @property {number} line     The 1-based line it starts on.
 */

/**
 * @param {string} sql
 * @returns {Statement[]}
 */
export function splitStatements(sql) {
  const statements = [];
  const lineAt = (index) => sql.slice(0, index).split("\n").length;
  let code = "";
  let first = -1;
  let i = 0;

  const take = (end) => {
    const chunk = sql.slice(i, end);
    if (first < 0 && chunk.trim()) first = i + chunk.length - chunk.trimStart().length;
    code += chunk;
    i = end;
  };
  const finish = () => {
    const text = code.trim();
    if (text) statements.push({ code: text, keyword: (/^[A-Za-z_]+/.exec(text)?.[0] || "").toLowerCase(), line: lineAt(first) });
    code = "";
    first = -1;
  };

  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];
    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      code += " ";
      i = end < 0 ? sql.length : end;
    } else if (char === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth) {
        if (sql[j] === "/" && sql[j + 1] === "*") { depth += 1; j += 2; }
        else if (sql[j] === "*" && sql[j + 1] === "/") { depth -= 1; j += 2; }
        else j += 1;
      }
      if (depth) throw new Error(`unterminated comment at line ${lineAt(i)}`);
      code += " ";
      i = j;
    } else if (char === "'") {
      // E'…' strings take backslash escapes; every string takes ''.
      const escapes = /[eE]/.test(sql[i - 1] || "") && !IDENTIFIER_CHAR.test(sql[i - 2] || "");
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) throw new Error(`unterminated string at line ${lineAt(i)}`);
        if (escapes && sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; }
        j += 1;
      }
      take(j + 1);
    } else if (char === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) throw new Error(`unterminated quoted identifier at line ${lineAt(i)}`);
        if (sql[j] === '"') { if (sql[j + 1] === '"') { j += 2; continue; } break; }
        j += 1;
      }
      take(j + 1);
    } else if (char === "$" && !IDENTIFIER_CHAR.test(sql[i - 1] || "") && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i))) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))[0];
      const close = sql.indexOf(tag, i + tag.length);
      if (close < 0) throw new Error(`unterminated ${tag} body at line ${lineAt(i)}`);
      take(close + tag.length);
    } else if (char === ";") {
      i += 1;
      finish();
    } else {
      take(i + 1);
    }
  }
  finish();
  return statements;
}

// What a migration may do at the top level and still be undone by a rollback.
// Transaction control would end the replay's own transaction and let every
// statement after it commit; a top-level SET would carry into the next file.
const REPLAYABLE = new Set(["create", "alter", "drop", "comment", "grant", "revoke", "insert", "update", "delete", "select", "with", "do", "notify", "lock"]);

// Calls whose effects a rollback does not undo, anywhere in the file: in a
// statement, a DO block, or a function or trigger the replay could fire.
const LASTING_CALL = /\b(nextval|setval|pg_advisory_lock|pg_advisory_lock_shared|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_logical_emit_message|lo_import|lo_export|dblink\w*|http(?:_\w+)?)\s*\(|\b(?:net|cron)\.\w+\s*\(/i;

/**
 * Why a file cannot be replayed and rolled back, one line per reason; empty
 * when it can.
 * @param {string} sql
 * @returns {string[]}
 */
export function replayHazards(sql) {
  let statements;
  try {
    statements = splitStatements(sql);
  } catch (error) {
    return [error.message];
  }
  const hazards = [];
  for (const statement of statements) {
    if (!REPLAYABLE.has(statement.keyword)) hazards.push(`line ${statement.line}: top-level ${statement.keyword || "statement"}`);
    const call = LASTING_CALL.exec(statement.code);
    if (call) hazards.push(`line ${statement.line}: ${call[0].replace(/\s*\($/, "")}() is not undone by a rollback`);
  }
  return hazards;
}
