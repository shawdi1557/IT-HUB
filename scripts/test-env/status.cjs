#!/usr/bin/env node
// Verifies the disposable environment's identity. Exits non-zero if it can't be confirmed.
const lib = require("./lib.cjs");

async function main() {
  await lib.verifyDisposable();
  const snapshot = lib.protectedSnapshot();
  console.log(
    `Protected database: ${snapshot ? `recovered orders ${snapshot.recoveredOrders}` : "not running"}`,
  );
}

main().catch((error) => lib.refuse(error.message));
