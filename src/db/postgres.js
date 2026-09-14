const { Pool } = require("pg");
const config = require("../config");

const pool = config.pgConnectionString
  ? new Pool({
      connectionString: config.pgConnectionString,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool(config.pg);

pool.on("error", (err) => {
  console.error("Unexpected Postgres error on idle client", err);
});

module.exports = pool;
