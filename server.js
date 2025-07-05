const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Data folder
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Ensure matches.json exists
const matchesFile = path.join(dataDir, 'matches.json');
if (!fs.existsSync(matchesFile)) {
  fs.writeFileSync(matchesFile, JSON.stringify([], null, 2));
}

// Superadmin va admin ma'lumotlari
const SUPERADMIN = {
  id: 'superadmin-1',
  name: 'Asosiy Admin',
  email: 'superadmin@mail.com',
  password: 'admin123',
  role: 'superadmin'
};
const ADMIN = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@mail.com',
  password: 'admin123',
  role: 'admin'
};

// Helper: read/write JSON
function readData(file) {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
function writeData(file, data) {
  const filePath = path.join(dataDir, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Superadmin va adminni har doim mavjud qilish ---
function ensureSuperadminAndAdmin() {
  // users.json
  let users = readData('users.json');
  let changed = false;
  if (!users.find(u => u.email === SUPERADMIN.email)) {
    users.unshift({ ...SUPERADMIN });
    changed = true;
  }
  if (!users.find(u => u.email === ADMIN.email)) {
    users.unshift({ ...ADMIN });
    changed = true;
  }
  if (changed) writeData('users.json', users);
  // admins.json
  let admins = readData('admins.json');
  let adminsChanged = false;
  if (!admins.find(a => a.email === SUPERADMIN.email)) {
    admins.unshift({ id: SUPERADMIN.id, name: SUPERADMIN.name, email: SUPERADMIN.email, role: SUPERADMIN.role });
    adminsChanged = true;
  }
  if (!admins.find(a => a.email === ADMIN.email)) {
    admins.push({ id: ADMIN.id, name: ADMIN.name, email: ADMIN.email, role: ADMIN.role });
    adminsChanged = true;
  }
  if (adminsChanged) writeData('admins.json', admins);
}
ensureSuperadminAndAdmin();

// --- News endpoints ---
app.get('/api/news', (req, res) => {
  const news = readData('news.json');
  res.json(news.filter(n => !n.deleted));
});

app.post('/api/news', (req, res) => {
  const { title, content, image, status, isFeatured } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title va content majburiy' });
  const news = readData('news.json');
  const newNews = {
    id: uuidv4(),
    title,
    content,
    image: image || null,
    status: status || 'Draft',
    deleted: false,
    publishedAt: new Date().toISOString(),
    isFeatured: !!isFeatured
  };
  // Faqat bitta yangilik kun yangiligi bo'lishi mumkin
  if (isFeatured) {
    news.forEach(n => { n.isFeatured = false; });
  }
  news.unshift(newNews);
  writeData('news.json', news);
  res.status(201).json(newNews);
});

app.put('/api/news/:id', (req, res) => {
  const { id } = req.params;
  const { title, content, image, status, isFeatured } = req.body;
  let news = readData('news.json');
  // Faqat bitta yangilik kun yangiligi bo'lishi mumkin
  if (isFeatured) {
    news.forEach(n => { n.isFeatured = false; });
  }
  news = news.map(n => n.id === id ? {
    ...n,
    title: title || n.title,
    content: content || n.content,
    image: image !== undefined ? image : n.image,
    status: status || n.status,
    isFeatured: !!isFeatured
  } : n);
  writeData('news.json', news);
  res.json({ success: true });
});

app.delete('/api/news/:id', (req, res) => {
  const { id } = req.params;
  let news = readData('news.json');
  news = news.map(n => n.id === id ? { ...n, deleted: true } : n);
  writeData('news.json', news);
  res.json({ success: true });
});

// --- News Comments API ---
app.get('/api/news/:id/comments', (req, res) => {
  const { id } = req.params;
  const comments = readData('comments.json');
  const newsComments = comments.filter(c => c.newsId === id);
  res.json(newsComments);
});

app.post('/api/news/:id/comments', (req, res) => {
  const { id } = req.params;
  const { author, text } = req.body;
  if (!author || !text) return res.status(400).json({ error: 'Ism va izoh majburiy' });
  const comments = readData('comments.json');
  const newComment = {
    id: uuidv4(),
    newsId: id,
    author,
    text,
    createdAt: new Date().toISOString()
  };
  comments.push(newComment);
  writeData('comments.json', comments);
  res.status(201).json(newComment);
});

app.delete('/api/news/:id/comments/:commentId', (req, res) => {
  const { id, commentId } = req.params;
  let comments = readData('comments.json');
  const exists = comments.find(c => c.id === commentId && c.newsId === id);
  if (!exists) return res.status(404).json({ error: 'Izoh topilmadi' });
  comments = comments.filter(c => !(c.id === commentId && c.newsId === id));
  writeData('comments.json', comments);
  res.json({ success: true });
});

// --- Admin endpoints (faqat superadmin qo'sha oladi) ---
app.get('/api/admins', (req, res) => {
  let admins = readData('admins.json');
  // Superadmin har doim birinchi bo'lib qaytadi
  if (!admins.find(a => a.email === SUPERADMIN.email)) {
    admins.unshift({ id: SUPERADMIN.id, name: SUPERADMIN.name, email: SUPERADMIN.email, role: SUPERADMIN.role });
  }
  res.json(admins);
});

app.post('/api/admins', (req, res) => {
  const { name, email, role = 'admin', superadminToken } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Ism va email majburiy' });
  if (email === SUPERADMIN.email) return res.status(400).json({ error: 'Superadminni qo\'shib bo\'lmaydi' });
  // Faqat superadmin tokeni bilan admin yoki jurnalist qo'shish mumkin
  if (role !== 'admin' && role !== 'journalist') return res.status(400).json({ error: 'Faqat admin yoki jurnalist qo\'shish mumkin' });
  if (superadminToken !== SUPERADMIN.password) return res.status(403).json({ error: 'Faqat superadmin admin yoki jurnalist qo\'sha oladi' });
  const admins = readData('admins.json');
  if (admins.find(a => a.email === email)) return res.status(400).json({ error: 'Bu email admin sifatida mavjud' });
  const newAdmin = { id: uuidv4(), name, email, role };
  admins.push(newAdmin);
  writeData('admins.json', admins);
  // users.json ga ham qo'shamiz
  let users = readData('users.json');
  users.push({ id: newAdmin.id, name, email, password: 'admin123', role });
  writeData('users.json', users);
  res.status(201).json(newAdmin);
});

app.delete('/api/admins/:id', (req, res) => {
  let admins = readData('admins.json');
  // Superadminni o'chirishga yo'l qo'ymaymiz
  admins = admins.filter(a => a.id !== req.params.id && a.email !== SUPERADMIN.email);
  // Lekin superadmin har doim bo'lishi kerak
  if (!admins.find(a => a.email === SUPERADMIN.email)) {
    admins.unshift({ id: SUPERADMIN.id, name: SUPERADMIN.name, email: SUPERADMIN.email, role: SUPERADMIN.role });
  }
  writeData('admins.json', admins);
  res.json({ success: true });
});

// --- User Auth (faqat user roli register bo'ladi) ---
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Barcha maydonlar majburiy' });
  if (email === SUPERADMIN.email || email === ADMIN.email) return res.status(400).json({ error: 'Bu email band' });
  const users = readData('users.json');
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email band' });
  const newUser = { id: uuidv4(), name, email, password, role: 'user' };
  users.push(newUser);
  writeData('users.json', users);
  res.status(201).json({ message: 'Ro\'yxatdan o\'tildi', user: newUser });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const users = readData('users.json');
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Email yoki parol xato' });
  // Demo token
  const token = uuidv4();
  res.json({ token, user });
});

// --- Matches (oddiy demo) ---
app.get('/api/matches', (req, res) => {
  const matches = readData('matches.json');
  res.json(matches);
});

// --- Polls (oddiy demo) ---
app.get('/api/polls', (req, res) => {
  const polls = readData('polls.json');
  res.json(polls);
});

// Yangi poll qo'shish (faqat admin/superadmin)
app.post('/api/polls', (req, res) => {
  const { question, options, role } = req.body;
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Savol va kamida 2 ta variant majburiy' });
  }
  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({ error: "Faqat admin yoki superadmin so'rovnoma qo'sha oladi" });
  }
  const polls = readData('polls.json');
  const votes = {};
  options.forEach(opt => { votes[opt] = 0; });
  const newPoll = {
    id: uuidv4(),
    question,
    votes,
    createdAt: new Date().toISOString()
  };
  polls.unshift(newPoll);
  writeData('polls.json', polls);
  res.status(201).json(newPoll);
});

app.post('/api/polls/vote', (req, res) => {
  const { pollId, option } = req.body;
  let polls = readData('polls.json');
  const poll = polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'Poll topilmadi' });
  poll.votes[option] = (poll.votes[option] || 0) + 1;
  writeData('polls.json', polls);
  res.json({ success: true });
});

app.delete('/api/polls/:id', (req, res) => {
  const { id } = req.params;
  const { role, superadminToken } = req.query;
  if (role !== 'admin' && role !== 'superadmin' && superadminToken !== SUPERADMIN.password) {
    return res.status(403).json({ error: "Faqat admin yoki superadmin so'rovnomani o'chira oladi" });
  }
  let polls = readData('polls.json');
  polls = polls.filter(p => p.id !== id);
  writeData('polls.json', polls);
  res.json({ success: true });
});

// --- User profile (oddiy demo) ---
app.get('/api/user/:id', (req, res) => {
  const users = readData('users.json');
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User topilmadi' });
  res.json(user);
});

// --- Category endpoints (faqat superadmin kategoriya qo'sha oladi) ---
app.get('/api/categories', (req, res) => {
  const categories = readData('categories.json');
  res.json(categories);
});

app.post('/api/categories', (req, res) => {
  const { name, superadminToken } = req.body;
  if (!name) return res.status(400).json({ error: 'Kategoriya nomi majburiy' });
  if (superadminToken !== SUPERADMIN.password) return res.status(403).json({ error: 'Faqat superadmin kategoriya qo\'sha oladi' });
  const categories = readData('categories.json');
  if (categories.find(cat => cat.name === name)) return res.status(400).json({ error: 'Bu nomli kategoriya allaqachon mavjud' });
  const newCategory = { id: uuidv4(), name };
  categories.push(newCategory);
  writeData('categories.json', categories);
  res.status(201).json(newCategory);
});

app.delete('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  const { superadminToken } = req.query;
  if (superadminToken !== SUPERADMIN.password) return res.status(403).json({ error: 'Faqat superadmin kategoriya o\'chira oladi' });
  let categories = readData('categories.json');
  categories = categories.filter(cat => cat.id !== id);
  writeData('categories.json', categories);
  res.json({ success: true });
});

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rasm yuklash endpointi
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fayl topilmadi' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

const teamLogos = {
  'Real Madrid': 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
  'Barcelona': 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg',
  'Manchester United': 'https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg',
  'Liverpool': 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg',
  'Bayern Munich': 'https://upload.wikimedia.org/wikipedia/en/1/1f/FC_Bayern_München_logo_%282017%29.svg',
  'Juventus': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Juventus_FC_2017_logo.svg',
  'Chelsea': 'https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg',
  'Arsenal': 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg',
  'PSG': 'https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg',
  'Inter': 'https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg',
  'Milan': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Logo_of_AC_Milan.svg',
  'Atletico Madrid': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Atletico_Madrid_2017_logo.svg',
  'Dortmund': 'https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg',
  'Tottenham': 'https://upload.wikimedia.org/wikipedia/en/b/b4/Tottenham_Hotspur.svg',
  'Roma': 'https://upload.wikimedia.org/wikipedia/en/f/f7/AS_Roma_logo_%282017%29.svg',
  'Napoli': 'https://upload.wikimedia.org/wikipedia/commons/2/2d/SSC_Napoli.svg',
  'Ajax': 'https://upload.wikimedia.org/wikipedia/en/7/79/Ajax_Amsterdam.svg',
  'Porto': 'https://upload.wikimedia.org/wikipedia/en/3/3f/FC_Porto.svg',
  'Benfica': 'https://upload.wikimedia.org/wikipedia/en/8/89/SL_Benfica_logo.svg',
  'Sevilla': 'https://upload.wikimedia.org/wikipedia/en/3/3c/Sevilla_FC_logo.svg',
  'Leipzig': 'https://upload.wikimedia.org/wikipedia/en/0/04/RB_Leipzig_2014_logo.svg',
  'Leicester City': 'https://upload.wikimedia.org/wikipedia/en/2/2d/Leicester_City_crest.svg',
  'Shakhtar Donetsk': 'https://upload.wikimedia.org/wikipedia/commons/6/6e/FC_Shakhtar_Donetsk.svg',
  'Galatasaray': 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Galatasaray_Sports_Club_Logo.png',
  'Fenerbahce': 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Fenerbahçe_SK.svg',
  'Besiktas': 'https://upload.wikimedia.org/wikipedia/commons/6/6e/Besiktas_JK.svg',
  // ... boshqa mashhur klublar qo'shish mumkin ...
};

app.get('/api/featured-match', (req, res) => {
  const matches = readData('matches.json');
  res.json(matches);
});

app.post('/api/featured-match', (req, res) => {
  const { home, away, time, date, league } = req.body;
  if (!home || !away || !time || !date || !league) return res.status(400).json({ error: 'Barcha maydonlar majburiy' });
  if (home === away) return res.status(400).json({ error: 'Uy va mehmon jamoalari bir xil bo\'lishi mumkin emas' });
  
  const matches = readData('matches.json');
  const newMatch = {
    id: uuidv4(),
    home: { name: home, logo: teamLogos[home] || null },
    away: { name: away, logo: teamLogos[away] || null },
    time,
    date,
    league,
    createdAt: new Date().toISOString()
  };
  matches.push(newMatch);
  writeData('matches.json', matches);
  res.status(201).json(newMatch);
});

app.put('/api/featured-match/:id', (req, res) => {
  const { id } = req.params;
  const { home, away, time, date, league } = req.body;
  if (!home || !away || !time || !date || !league) return res.status(400).json({ error: 'Barcha maydonlar majburiy' });
  if (home === away) return res.status(400).json({ error: 'Uy va mehmon jamoalari bir xil bo\'lishi mumkin emas' });
  
  let matches = readData('matches.json');
  const matchExists = matches.find(m => m.id === id);
  if (!matchExists) return res.status(404).json({ error: 'Match topilmadi' });
  
  matches = matches.map(m => m.id === id ? {
    ...m,
    home: { name: home, logo: teamLogos[home] || null },
    away: { name: away, logo: teamLogos[away] || null },
    time,
    date,
    league,
    updatedAt: new Date().toISOString()
  } : m);
  writeData('matches.json', matches);
  res.json({ success: true });
});

app.delete('/api/featured-match/:id', (req, res) => {
  const { id } = req.params;
  let matches = readData('matches.json');
  const matchExists = matches.find(m => m.id === id);
  if (!matchExists) return res.status(404).json({ error: 'Match topilmadi' });
  
  matches = matches.filter(m => m.id !== id);
  writeData('matches.json', matches);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`eScore backend running on http://localhost:${PORT}`);
}); 