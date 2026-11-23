import { createHash, randomBytes } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { access, mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = path.join(PROJECT, ".local");
const MYSQL_VERSION = "8.4.13";
const MYSQL_ARCHIVE = `mysql-${MYSQL_VERSION}-winx64.zip`;
const MYSQL_URL = `https://cdn.mysql.com/Downloads/MySQL-8.4/${MYSQL_ARCHIVE}`;
const MYSQL_MD5 = "7b94489d5524dea9b27097068bea25a8";
const RUNTIME = path.join(LOCAL, "mysql-runtime");
const BASEDIR = path.join(RUNTIME, `mysql-${MYSQL_VERSION}-winx64`);
const DATADIR = path.join(LOCAL, "mysql-data");
const LOGDIR = path.join(LOCAL, "logs");
const MYSQLD = path.join(BASEDIR, "bin", "mysqld.exe");
const SECRETS_FILE = path.join(LOCAL, "mysql-secrets.json");
const INIT_FILE = path.join(LOCAL, "mysql-first-start.sql");
const READY_FILE = path.join(LOCAL, "mysql-provisioned.json");
const PORT = 3307;
const HOST = "127.0.0.1";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalized = (value) =>
  path
    .resolve(value)
    .replace(/[\\/]+$/, "")
    .toLowerCase();
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

function writePrivate(file, contents, flag = "w") {
  writeFileSync(file, contents, { encoding: "utf8", mode: 0o600, flag });
}

function privateSettings() {
  mkdirSync(LOCAL, { recursive: true });
  if (existsSync(SECRETS_FILE)) {
    const settings = JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
    if (
      !/^[a-f0-9]{48,}$/.test(settings.rootPassword ?? "") ||
      !/^[a-f0-9]{48,}$/.test(settings.appPassword ?? "")
    ) {
      throw new Error(
        "The private local MySQL settings are invalid. Existing database credentials have not been changed.",
      );
    }
    return settings;
  }
  const settings = {
    rootPassword: randomBytes(32).toString("hex"),
    appPassword: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32).toString("hex"),
    sessionSecret: randomBytes(32).toString("hex"),
    adminEmail: "owner@forme.local",
    adminName: "Owner",
    adminPassword: randomBytes(24).toString("base64url"),
  };
  writePrivate(SECRETS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "wx");
  return settings;
}

function ensureEnvironment(settings) {
  const envPath = path.join(PROJECT, ".env");
  if (existsSync(envPath)) return;
  const environment = {
    NODE_ENV: "development",
    API_PORT: "4000",
    PORT: "4000",
    APP_URL: "http://127.0.0.1:5174",
    API_BASE_URL: "http://127.0.0.1:4000",
    PUBLIC_BASE_URL: "http://127.0.0.1:4000",
    ALLOWED_ORIGINS: "http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:4000",
    MYSQL_HOST: HOST,
    MYSQL_PORT: String(PORT),
    MYSQL_DATABASE: "forme",
    MYSQL_DATABASE_TEST: "forme_test",
    MYSQL_USER: "forme_app",
    MYSQL_PASSWORD: settings.appPassword,
    ENCRYPTION_KEY: settings.encryptionKey,
    SESSION_SECRET: settings.sessionSecret,
    ADMIN_EMAIL: settings.adminEmail,
    ADMIN_NAME: settings.adminName,
    ADMIN_PASSWORD: settings.adminPassword,
  };
  writePrivate(
    envPath,
    `# Private local development settings. Never commit this file.\n${Object.entries(environment)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    "wx",
  );
  writePrivate(
    path.join(LOCAL, "access.txt"),
    [
      "FORME local development access (private)",
      "",
      "Storefront: http://127.0.0.1:5174",
      "Admin: http://127.0.0.1:5174/admin",
      "API: http://127.0.0.1:4000",
      "",
      `Owner email: ${settings.adminEmail}`,
      `Owner password: ${settings.adminPassword}`,
      "",
      "The owner account is created by the application's database bootstrap.",
      "Change the owner password in admin after the first sign-in.",
      "",
      `MySQL host: ${HOST}`,
      `MySQL port: ${PORT}`,
      "MySQL database: forme",
      "MySQL user: forme_app",
      `MySQL application password: ${settings.appPassword}`,
      "",
      "Root credentials are stored in .local/mysql-secrets.json; root has no remote account.",
      "Merchant credentials are intentionally unset. Configure them in admin when ready.",
      "",
    ].join("\n"),
    "wx",
  );
}

async function checksum(file) {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function ensureRuntime() {
  if (process.platform !== "win32")
    throw new Error(
      "This local runtime helper is for Windows. Use your installed MySQL 8.4 server on other systems.",
    );
  if (existsSync(MYSQLD)) return;
  const downloads = path.join(LOCAL, "downloads");
  await mkdir(downloads, { recursive: true });
  const archive = path.join(downloads, MYSQL_ARCHIVE);
  if (!existsSync(archive)) {
    console.log("Downloading the official MySQL 8.4 Windows distribution…");
    const response = await fetch(MYSQL_URL, {
      redirect: "error",
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok || !response.body)
      throw new Error("The official MySQL download could not be completed. Try setup again later.");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { flags: "wx" }));
  }
  if ((await checksum(archive)) !== MYSQL_MD5) {
    throw new Error(
      "The MySQL archive checksum does not match the official distribution. No binaries were extracted or started.",
    );
  }
  console.log("Verified the official MySQL archive. Extracting the isolated runtime…");
  mkdirSync(RUNTIME, { recursive: true });
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(RUNTIME)} -Force`,
    ],
    { cwd: PROJECT, windowsHide: true, encoding: "utf8", timeout: 180_000 },
  );
  if (result.status !== 0 || !existsSync(MYSQLD))
    throw new Error(
      "The MySQL runtime could not be extracted. The existing databases were not changed.",
    );
}

function portIsOpen() {
  return new Promise((resolve) => {
    const connection = net.createConnection({ host: HOST, port: PORT });
    const finish = (open) => {
      connection.destroy();
      resolve(open);
    };
    connection.once("connect", () => finish(true));
    connection.once("error", () => finish(false));
    connection.setTimeout(800, () => finish(false));
  });
}

async function verifyOurServer(settings) {
  const mysql = await import("mysql2/promise");
  let connection;
  try {
    connection = await mysql.createConnection({
      host: HOST,
      port: PORT,
      user: "forme_app",
      password: settings.appPassword,
      database: "forme",
      connectTimeout: 1_500,
    });
    const [rows] = await connection.query(
      "SELECT VERSION() AS version, @@datadir AS dataDirectory",
    );
    const server = rows[0];
    if (
      !/^8\.4\./.test(server.version) ||
      /mariadb/i.test(server.version) ||
      normalized(server.dataDirectory) !== normalized(DATADIR)
    ) {
      throw new Error("Port 3307 is occupied by a different database. It has not been changed.");
    }
    return { version: server.version, host: HOST, port: PORT, database: "forme" };
  } finally {
    await connection?.end();
  }
}

function initializeData(settings) {
  if (existsSync(path.join(DATADIR, "auto.cnf"))) return;
  mkdirSync(DATADIR, { recursive: true });
  if (readdirSync(DATADIR).length) {
    throw new Error(
      "The isolated data directory is not empty but is not initialized. Setup will not delete or overwrite it.",
    );
  }
  mkdirSync(LOGDIR, { recursive: true });
  const result = spawnSync(
    MYSQLD,
    [
      "--no-defaults",
      "--initialize-insecure",
      `--basedir=${BASEDIR}`,
      `--datadir=${DATADIR}`,
      `--log-error=${path.join(LOGDIR, "mysql-initialize.log")}`,
    ],
    { cwd: PROJECT, windowsHide: true, encoding: "utf8", timeout: 120_000 },
  );
  if (result.status !== 0)
    throw new Error(
      "MySQL initialization did not complete. See .local/logs/mysql-initialize.log. Existing databases were not changed.",
    );
  const sql = [
    `ALTER USER 'root'@'localhost' IDENTIFIED BY ${sqlLiteral(settings.rootPassword)};`,
    "CREATE DATABASE IF NOT EXISTS forme CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;",
    "CREATE DATABASE IF NOT EXISTS forme_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;",
    `CREATE USER IF NOT EXISTS 'forme_app'@'127.0.0.1' IDENTIFIED BY ${sqlLiteral(settings.appPassword)};`,
    "GRANT ALL PRIVILEGES ON forme.* TO 'forme_app'@'127.0.0.1';",
    "GRANT ALL PRIVILEGES ON forme_test.* TO 'forme_app'@'127.0.0.1';",
    "",
  ].join("\n");
  writePrivate(INIT_FILE, sql, "wx");
  console.log("Initialized a new isolated MySQL data directory.");
}

export async function startLocalMySql({ setup = false } = {}) {
  const settings = privateSettings();
  if (await portIsOpen()) {
    let details;
    try {
      details = await verifyOurServer(settings);
    } catch {
      throw new Error(
        "Port 3307 is already in use and is not this project's configured MySQL server. Nothing was stopped or changed.",
      );
    }
    console.log(`Local MySQL ${details.version} is already ready at ${HOST}:${PORT}.`);
    return details;
  }
  if (setup) {
    await ensureRuntime();
    ensureEnvironment(settings);
    initializeData(settings);
  }
  if (!existsSync(MYSQLD) || !existsSync(path.join(DATADIR, "auto.cnf"))) {
    throw new Error(
      "The project MySQL runtime is not initialized. Run node scripts/setup-local-mysql.mjs first.",
    );
  }
  mkdirSync(LOGDIR, { recursive: true });
  const firstStart = !existsSync(READY_FILE);
  if (firstStart && !existsSync(INIT_FILE)) {
    throw new Error(
      "The first-start provisioning file is missing. Existing database passwords were not reset.",
    );
  }
  const argumentsList = [
    "--no-defaults",
    `--basedir=${BASEDIR}`,
    `--datadir=${DATADIR}`,
    `--bind-address=${HOST}`,
    `--port=${PORT}`,
    "--mysqlx=OFF",
    "--skip-name-resolve",
    "--skip-log-bin",
    `--log-error=${path.join(LOGDIR, "mysql-error.log")}`,
    `--pid-file=${path.join(DATADIR, "forme-mysql.pid")}`,
    ...(firstStart ? [`--init-file=${INIT_FILE}`] : []),
  ];
  const stdout = openSync(path.join(LOGDIR, "mysql-stdout.log"), "a");
  const stderr = openSync(path.join(LOGDIR, "mysql-stderr.log"), "a");
  const child = spawn(MYSQLD, argumentsList, {
    cwd: PROJECT,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", stdout, stderr],
  });
  closeSync(stdout);
  closeSync(stderr);
  let spawnFailure;
  child.once("error", (error) => {
    spawnFailure = error;
  });
  child.unref();
  for (let attempt = 0; attempt < 90; attempt++) {
    if (spawnFailure)
      throw new Error(
        "The isolated MySQL process could not be started. Check the local runtime permissions.",
      );
    try {
      const details = await verifyOurServer(settings);
      if (firstStart)
        writePrivate(
          READY_FILE,
          `${JSON.stringify({ version: details.version, initializedAt: new Date().toISOString(), pid: child.pid }, null, 2)}\n`,
          "wx",
        );
      console.log(`Local MySQL ${details.version} is ready at ${HOST}:${PORT}; database forme.`);
      console.log(
        "Private development access is saved in .local/access.txt. No credentials were printed.",
      );
      return details;
    } catch {
      await wait(500);
    }
  }
  throw new Error(
    "MySQL did not become ready. See .local/logs/mysql-error.log. Existing databases were not changed.",
  );
}

if (process.argv[1] && normalized(process.argv[1]) === normalized(fileURLToPath(import.meta.url))) {
  startLocalMySql({ setup: true }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
