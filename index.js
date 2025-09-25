const express = require('express');
const cors = require('cors');
const RateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const sanitizeHtml = require('sanitize-html');
const Filter = require('bad-words');
const path = require('path');

const PORT = process.env.PORT || 4000;
const app = express();
const db = new Database('./stories.db');
const filter = new Filter();

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiter
const limiter = RateLimit({
  windowMs: 60 * 1000,
  max: 20
});
app.use(limiter);

// Initialize DB
db.prepare(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    text TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    flagged INTEGER DEFAULT 0
  )
`).run();

// Helper to clean inputs
function cleanInput(str){
  const cleaned = sanitizeHtml(str, {allowedTags: [], allowedAttributes: {}});
  return cleaned.trim().slice(0, 2000);
}

// API routes
app.post('/api/stories', (req, res) => {
  try {
    let { username, text, ageConfirmed } = req.body;
    if (!ageConfirmed) return res.status(400).json({ error: 'Age confirmation required' });

    username = cleanInput(username || 'Anon');
    text = cleanInput(text || '');
    if (!text) return res.status(400).json({ error: 'Text required' });

    const flagged = filter.isProfane(username) || filter.isProfane(text) ? 1 : 0;

    const stmt = db.prepare('INSERT INTO stories (username, text, flagged) VALUES (?, ?, ?)');
    const info = stmt.run(username, text, flagged);

    res.json({ ok: true, id: info.lastInsertRowid, flagged });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/stories', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit)||20, 50);
  const offset = parseInt(req.query.offset)||0;
  const rows = db.prepare('SELECT id, username, text, created_at, flagged FROM stories WHERE flagged = 0 ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  res.json(rows);
});

app.get('/api/flagged', (req, res) => {
  const rows = db.prepare('SELECT * FROM stories WHERE flagged = 1 ORDER BY id DESC').all();
  res.json(rows);
});

// Serve React build
app.use(express.static(path.join(__dirname, 'build')));

// Catch-all route to serve React index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
