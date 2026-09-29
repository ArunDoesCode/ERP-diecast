/**
 * Creates the first super-admin on a seeded, empty database (known-defects BR-KD-17..29).
 * Input: BOOTSTRAP_ADMIN_NAME / _EMAIL / _PASSWORD (+ optional _PHONE) from env.
 * Exit codes: 0 created, 1 unexpected, 2 already bootstrapped, 3 roles missing, 4 bad input, 5 email taken.
 * Never prints the password or its hash.
 */
import postgres from "postgres";

const EXIT = {
  ok: 0,
  error: 1,
  done: 2,
  roles: 3,
  input: 4,
  email: 5,
} as const;
const LOCK_KEY = 74_001_004; // advisory lock: serialises concurrent runs (BR-KD-27)

function fail(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

/** Ask for a value on the terminal without echoing it. */
async function promptHidden(label: string): Promise<string> {
  process.stdout.write(label);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(buf);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.exit(EXIT.error);
        }
        if (ch === "\u007f") buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readInput() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() ?? "";
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() ?? "";
  const phone = process.env.BOOTSTRAP_ADMIN_PHONE?.trim() || null;
  let password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";

  if (!name) {
    fail(EXIT.input, "Invalid input: name is required (BOOTSTRAP_ADMIN_NAME).");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(
      EXIT.input,
      "Invalid input: email is missing or not a valid address (BOOTSTRAP_ADMIN_EMAIL).",
    );
  }
  if (!password) {
    if (!process.stdin.isTTY) {
      fail(
        EXIT.input,
        "Invalid input: password is required (BOOTSTRAP_ADMIN_PASSWORD) and there is no terminal to ask on.",
      );
    }
    password = await promptHidden("Password: ");
    const again = await promptHidden("Repeat password: ");
    if (password !== again) {
      fail(EXIT.input, "Invalid input: the two passwords do not match.");
    }
  }
  if (password.length < 8) {
    fail(EXIT.input, "Invalid input: password must be at least 8 characters.");
  }
  return { name, email, phone, password };
}

async function main() {
  const input = await readInput();
  const url = process.env.DATABASE_URL;
  if (!url) fail(EXIT.error, "DATABASE_URL is not set.");

  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    connect_timeout: 10,
  });
  try {
    const passwordHash = await Bun.password.hash(input.password);

    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;

      const [role] = await tx`SELECT id FROM roles WHERE name = 'super-admin'`;
      if (!role) return { code: EXIT.roles as number };

      const [active] =
        await tx`SELECT 1 FROM employees WHERE role_id = ${role.id} AND is_active = true LIMIT 1`;
      if (active) return { code: EXIT.done as number };

      const [taken] =
        await tx`SELECT 1 FROM employees WHERE lower(email) = lower(${input.email}) LIMIT 1`;
      if (taken) return { code: EXIT.email as number };

      const [row] = await tx`
        INSERT INTO employees (name, email, password_hash, phone, role_id, is_active)
        VALUES (${input.name}, ${input.email}, ${passwordHash}, ${input.phone}, ${role.id}, true)
        RETURNING id`;
      await tx`UPDATE employees SET created_by = id, last_updated_by = id WHERE id = ${row.id}`;
      await tx`
        INSERT INTO auth_audit_log (actor_id, action, target, after)
        VALUES (${row.id}, 'employee.bootstrap', ${`employee:${row.id}`},
          ${tx.json({ name: input.name, email: input.email, role: "super-admin" })})`;
      return { code: EXIT.ok as number, id: row.id as number };
    });

    if (result.code === EXIT.roles) {
      fail(
        EXIT.roles,
        "Roles are not seeded (no super-admin role). Run db:reset first.",
      );
    }
    if (result.code === EXIT.done) {
      fail(
        EXIT.done,
        "Already bootstrapped: an active super-admin exists. Nothing written.",
      );
    }
    if (result.code === EXIT.email) {
      fail(
        EXIT.email,
        "That email already belongs to an existing employee. Nothing written.",
      );
    }
    console.log(
      `Created super-admin: id=${result.id} name=${input.name} email=${input.email} role=super-admin`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  // Keep to the class of failure; never echo the message wholesale.
  console.error(
    `Unexpected error: ${err instanceof Error ? err.name : "unknown"}`,
  );
  process.exit(EXIT.error);
});
