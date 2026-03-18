const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
});

// Set Bangkok timezone for every connection
const originalGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async () => {
  const conn = await originalGetConnection();
  await conn.query("SET time_zone = '+07:00'");
  return conn;
};

module.exports = pool;