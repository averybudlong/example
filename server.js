// server.js
import express from 'express';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

/* ---------- MySQL connection pool ---------- */
const pool = mysql.createPool({
  host            : 'localhost',
  user            : 'root',
  password        : 'my-secret-pw',
  database        : 'demo',
  waitForConnections : true,
  connectionLimit : 10,
  queueLimit      :  0
});

/* ---------- Express basics ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Routes ---------- */
app.get('/', (_, res) => res.render('index'));

/**
 * GET /search?q=term
 * Returns at most 10 rows whose `name` column contains the term (case-insensitive).
 * Responds with JSON: [{id, name}, ...]
 */
app.get('/search', async (req, res) => {
  const term = (req.query.q || '').trim();

  if (term === '') {        // nothing typed –> return empty array
    return res.json([]);
  }

  try {
    const sql  = 'SELECT id, name FROM items WHERE name LIKE ? LIMIT 10';
    const like = `%${term}%`;                       // parameterised to avoid SQL-i
    const [rows] = await pool.execute(sql, [like]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ---------- Start ---------- */
app.listen(PORT, () =>
  console.log(`💻  http://localhost:${PORT} – press Ctrl-C to quit`)
);
