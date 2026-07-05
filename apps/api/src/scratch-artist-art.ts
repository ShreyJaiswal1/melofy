import axios from 'axios';

async function main() {
  const artistUrl = 'https://music.apple.com/us/artist/the-neighbourhood/219350813';
  console.log('Querying lookup API for url:', artistUrl);
  try {
    const lookupRes = await axios.post('https://api.bendodson.com/v1/artwork/apple-music/lookup', {
      url: artistUrl
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://bendodson.com/',
        'Origin': 'https://bendodson.com'
      }
    });
    console.log('Lookup Response:', JSON.stringify(lookupRes.data, null, 2));

    console.log('\nQuerying animation API for url:', artistUrl);
    const animRes = await axios.post('https://api.bendodson.com/v1/artwork/apple-music/animation', {
      url: artistUrl
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://bendodson.com/',
        'Origin': 'https://bendodson.com'
      }
    });
    console.log('Animation Response:', JSON.stringify(animRes.data, null, 2));

  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
}

main();
