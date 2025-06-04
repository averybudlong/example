// server.js  (only the /search endpoint shown)

app.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();

  if (!q) return res.json([]);

  // If q is an integer, we’ll also match age exactly
  const isNumber   = /^\d+$/.test(q);
  const likeParam  = `%${q}%`;

  const sql = `
    SELECT id, name, age, location
    FROM   people
    WHERE  name     LIKE ?
       OR  location LIKE ?
       OR  bio      LIKE ?
       ${isNumber ? 'OR age = ?' : ''}
    LIMIT  25
  `;

  const params = isNumber
    ? [likeParam, likeParam, likeParam, Number(q)]
    : [likeParam, likeParam, likeParam];

  try {
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({error: 'db error'});
  }
});
