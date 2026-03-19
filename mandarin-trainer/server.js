import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatHandler from './api/chat.js';
import speechTokenHandler from './api/speech-token.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', chatHandler);
app.get('/api/speech-token', speechTokenHandler);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3001, () => console.log('Proxy server running on :3001'));
