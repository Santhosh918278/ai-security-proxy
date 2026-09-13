const { Pool } = require("pg");
const config = require("../config");

const pool = new Pool(config.pg);

pool.on("error", (err) => {
  console.error("Unexpected Postgres error on idle client", err);
});

module.exports = pool;
