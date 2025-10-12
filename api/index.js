import express from 'express';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import qrcode from 'qrcode';
import expressLayouts from 'express-ejs-layouts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);
app.set('layout', 'layout');

// Database setup
let db;
async function initDb() {
  db = await open({
    filename: path.join(__dirname, 'database.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE,
      used INTEGER DEFAULT 0
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
await initDb();

// Halaman utama: scan QR code
app.get('/', (req, res) => {
  res.render('scan_qr'); // Buat file views/scan_qr.ejs untuk scan QR siswa
});

// Halaman voting (akses via token dari QR)
app.get('/vote', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/');
  // Pastikan token valid dan belum dipakai
  const row = await db.get('SELECT * FROM tokens WHERE token = ? AND used = 0', [token]);
  if (!row) return res.send('Token tidak valid atau sudah digunakan.');
  // Daftar kandidat (bisa diganti sesuai kebutuhan)
  const candidates = ['Kandidat A', 'Kandidat B', 'Kandidat C'];
  res.render('vote', { token, candidates });
});

// Proses voting
app.post('/vote', async (req, res) => {
  const { candidate, token } = req.body;
  // Validasi token
  const row = await db.get('SELECT * FROM tokens WHERE token = ? AND used = 0', [token]);
  if (!row) return res.send('Token tidak valid atau sudah digunakan.');
  // Simpan vote dan hanguskan token
  await db.run('INSERT INTO votes (candidate) VALUES (?)', [candidate]);
  await db.run('UPDATE tokens SET used = 1 WHERE token = ?', [token]);
  res.redirect('/vote-berhasil');
});

// Admin: generate dan lihat token + QR code
app.get('/admin/tokens', async (req, res) => {
  const tokens = await db.all('SELECT * FROM tokens ORDER BY id DESC');
  res.render('admin_tokens', { tokens });
});

app.post('/admin/tokens/new', async (req, res) => {
  const token = nanoid(8);
  await db.run('INSERT INTO tokens (token) VALUES (?)', [token]);
  res.redirect('/admin/tokens');
});

app.get('/admin/qr/:token', async (req, res) => {
  const { token } = req.params;
  const url = `${req.protocol}://192.168.1.5:3000/vote?token=${token}`;
  //const url = `${req.protocol}://${req.get('host')}/vote?token=${token}`;
  const qr = await qrcode.toDataURL(url);
  res.render('qr', { token, qr });
});

// Admin: hasil voting
app.get('/admin/results', async (req, res) => {
  const results = await db.all(`
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