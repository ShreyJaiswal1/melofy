import axios from 'axios';

async function main() {
  const url = 'https://bendodson.com/projects/apple-music-artwork-finder/';
  console.log('Fetching', url);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = res.data;

    // Find script tags
    const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["']/gi;
    let match;
    console.log('--- Script Srcs ---');
    while ((match = scriptRegex.exec(html)) !== null) {
      console.log(match[1]);
    }

    // Find inline scripts
    const inlineScriptRegex = /<script>([\s\S]*?)<\/script>/gi;
    let inlineMatch;
    console.log('\n--- Inline Scripts ---');
    while ((inlineMatch = inlineScriptRegex.exec(html)) !== null) {
      console.log(inlineMatch[1].substring(0, 500));
    }

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
