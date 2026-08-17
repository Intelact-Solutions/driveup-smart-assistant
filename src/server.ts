import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { config, projectRoot } from './config.js';
import { queryRouter } from './routes/query.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/chatbot', queryRouter);

app.use(express.static(path.join(projectRoot, 'public')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`driveup-smart-assistant listening on http://localhost:${config.port}`);
  console.log(`Knowledge base: ${config.kbPath}`);
  console.log(`Index: ${config.kbIndexPath}`);
});