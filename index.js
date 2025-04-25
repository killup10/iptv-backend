const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const readline = require('readline');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());

// Conexión MongoDB
mongoose.connect('mongodb+srv://KillupBlack:Alptraum100%40@teamg.joradno.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB conectado'))
  .catch(err => console.error('Error de conexión MongoDB:', err));

const VideoSchema = new mongoose.Schema({
  title: String,
  logo: String,
  group: String,
  url: String,
  createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', VideoSchema);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/api/upload-m3u', upload.single('file'), async (req, res) => {
  const entries = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream });

  let currentTitle = '';
  let currentLogo = '';
  let currentGroup = '';

  for await (const line of rl) {
    if (line.startsWith('#EXTINF')) {
      const titleMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo="(.*?)"/);
      const groupMatch = line.match(/group-title="(.*?)"/);

      currentTitle = titleMatch ? titleMatch[1] : 'Sin título';
      currentLogo = logoMatch ? logoMatch[1] : '';
      currentGroup = groupMatch ? groupMatch[1] : '';
    } else if (line.startsWith('http')) {
      const video = new Video({
        title: currentTitle,
        logo: currentLogo,
        group: currentGroup,
        url: line
      });
      await video.save();
      entries.push(video);
    }
  }

  fs.unlinkSync(req.file.path);
  res.json({ entries });
});

app.get('/api/videos', async (req, res) => {
  const videos = await Video.find().sort({ createdAt: -1 });
  res.json(videos);
});

app.listen(port, () => {
  console.log(`Servidor IPTV en puerto ${port}`);
});
