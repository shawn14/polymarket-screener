import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const filePath = resolve(__dirname, '../data/edge-watchlist.json');
  
  if (!existsSync(filePath)) {
    return res.status(200).json({ traders: [], description: 'No watchlist configured' });
  }
  
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
