import { startLocalMySql } from "./setup-local-mysql.mjs";

startLocalMySql().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
