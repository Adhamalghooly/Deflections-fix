import https from 'https';
import fs from 'fs';

const URL = 'https://github.com/adhmalghwly2050-maker/foundation-designer-pro-dd7dc040/archive/refs/heads/main.zip';

function download(url) {
  console.log('Fetching', url);
  https.get(url, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers));

    if (res.statusCode === 301 || res.statusCode === 302) {
      console.log('Redirecting to:', res.headers.location);
      download(res.headers.location);
      return;
    }

    if (res.statusCode !== 200) {
      console.error('Non-200 response!');
      return;
    }

    const file = fs.createWriteStream('repo.zip');
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Download finished. Size:', fs.statSync('repo.zip').size);
    });
  }).on('error', (err) => {
    console.error('Error:', err);
  });
}

download(URL);
