import express from 'express';
import path from 'path';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import qrcode from 'qrcode';
import expressLayouts from 'express-ejs-layouts';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Koneksi ke database Postgres (Supabase/Neon)
const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, { ssl: 'require' });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);
app.set('layout', 'layout');

// Inisialisasi tabel (jalankan sekali di awal, atau gunakan migration tool)
await sql`
  CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(32) UNIQUE,
    used BOOLEAN DEFAULT FALSE
  );
`;
await sql`
  CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    candidate VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

// Halaman voting (akses via token dari QR)
app.get('/vote', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/');
  const rows = await sql`SELECT * FROM tokens WHERE token = ${token} AND used = FALSE`;
  if (rows.length === 0) return res.send('Token tidak valid atau sudah digunakan.');
  const candidates = ['Kandidat A', 'Kandidat B', 'Kandidat C'];
  res.render('vote', { token, candidates });
});

// Proses voting
app.post('/vote', async (req, res) => {
  const { candidate, token } = req.body;
  const rows = await sql`SELECT * FROM tokens WHERE token = ${token} AND used = FALSE`;
  if (rows.length === 0) return res.send('Token tidak valid atau sudah digunakan.');
  await sql`INSERT INTO votes (candidate) VALUES (${candidate})`;
  await sql`UPDATE tokens SET used = TRUE WHERE token = ${token}`;
  res.redirect('/vote-berhasil');
});

// Admin: generate dan lihat token + QR code
app.get('/admin/tokens', async (req, res) => {
  const tokens = await sql`SELECT * FROM tokens ORDER BY id DESC`;
  res.render('admin_tokens', { tokens });
});

app.post('/admin/tokens/new', async (req, res) => {
  const token = nanoid(8);
  await sql`INSERT INTO tokens (token) VALUES (${token})`;
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
  const results = await sql`
    SELECT candidate, COUNT(*) AS total
    FROM votes
    GROUP BY candidate
  `;
  res.render('results', { results });
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
