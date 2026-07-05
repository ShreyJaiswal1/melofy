import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const url = 'https://bendodson.com/apple-music-2026-06-21.js';
  console.log('Downloading script...', url);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const code = res.data;
    
    // Search for fetch, ajax, or url patterns
    console.log('Script length:', code.length);

    // Save it locally so we can inspect it or read it
    const savePath = path.join(__dirname, 'ben-dodson-script.js');
    fs.writeFileSync(savePath, code);
    console.log('Saved script to', savePath);

    // Look for lines containing "api.music.apple.com" or "token"
    const lines = code.split('\n');
    lines.forEach((line: string, idx: number) => {
      if (line.includes('music.apple.com') || line.includes('token') || line.includes('bearer') || line.includes('jwt')) {
        console.log(`Line ${idx + 1}: ${line.substring(0, 300)}`);
      }
    });

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
