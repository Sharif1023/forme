import mysql from "mysql2/promise";
import { config } from "../config.mjs";

let pool;
export function getPool() {
  if (!pool) {
    pool = mysql.createPool(
      config.databaseUrl
        ? {
            uri: config.databaseUrl,
            waitForConnections: true,
            connectionLimit: 10,
            timezone: "Z",
            decimalNumbers: true,
            supportBigNumbers: true,
            bigNumberStrings: false,
          }
        : {
            host: config.dbHost,
            port: config.dbPort,
            database: config.dbName,
            user: config.dbUser,
            password: config.dbPassword,
            waitForConnections: true,
            connectionLimit: 10,
            timezone: "Z",
            decimalNumbers: true,
            supportBigNumbers: true,
            bigNumberStrings: false,
          },
    );
  }
  return pool;
}
export async function query(sql, parameters = [], connection = getPool()) {
  const [rows] = await connection.execute(sql, parameters);
  return rows;
}
export async function withTransaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}
