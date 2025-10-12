import express from 'express';
import path from 'path';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import qrcode from 'qrcode';
import expressLayouts from 'express-ejs-layouts';
import { Pool } from 'pg'; // Ganti ke pg
import postgres from 'postgres'


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Koneksi ke database Postgres (Neon/Supabase)
const connectionString = process.env.DATABASE_URL
const pool = postgres(connectionString)

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);
app.set('layout', 'layout');

// Inisialisasi tabel (jalankan sekali di awal, atau gunakan migration tool)
await pool.query(`
  CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(32) UNIQUE,
    used BOOLEAN DEFAULT FALSE
  );
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    candidate VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// Halaman voting (akses via token dari QR)
app.get('/vote', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/');
  const { rows } = await pool.query('SELECT * FROM tokens WHERE token = $1 AND used = FALSE', [token]);
  if (rows.length === 0) return res.send('Token tidak valid atau sudah digunakan.');
  const candidates = ['Kandidat A', 'Kandidat B', 'Kandidat C'];
  res.render('vote', { token, candidates });
});

// Proses voting
app.post('/vote', async (req, res) => {
  const { candidate, token } = req.body;
  const { rows } = await pool.query('SELECT * FROM tokens WHERE token = $1 AND used = FALSE', [token]);
  if (rows.length === 0) return res.send('Token tidak valid atau sudah digunakan.');
  await pool.query('INSERT INTO votes (candidate) VALUES ($1)', [candidate]);
  await pool.query('UPDATE tokens SET used = TRUE WHERE token = $1', [token]);
  res.redirect('/vote-berhasil');
});

// Admin: generate dan lihat token + QR code
app.get('/admin/tokens', async (req, res) => {
  const { rows: tokens } = await pool.query('SELECT * FROM tokens ORDER BY id DESC');
  res.render('admin_tokens', { tokens });
});

app.post('/admin/tokens/new', async (req, res) => {
  const token = nanoid(8);
  await pool.query('INSERT INTO tokens (token) VALUES ($1)', [token]);
  res.redirect('/admin/tokens');
});

app.get('/admin/qr/:token', async (req, res) => {
  const { token } = req.params;
  const url = `${req.protocol}://${req.get('host')}/vote?token=${token}`;
  const qr = await qrcode.toDataURL(url);
  res.render('qr', { token, qr });
});

// Admin: hasil voting
app.get('/admin/results', async (req, res) => {
  const { rows: results } = await pool.query(`
    SELECT candidate, COUNT(*) AS total
    FROM votes
    GROUP BY candidate
  `);
  res.render('results', { results });
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
