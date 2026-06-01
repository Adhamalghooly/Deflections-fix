import https from 'https';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const ZIP_URL = 'https://github.com/adhmalghwly2050-maker/foundation-designer-pro-dd7dc040/archive/refs/heads/main.zip';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log('GET:', url);
    const request = https.get(url, (response) => {
      console.log('Response headers received. Status:', response.statusCode);
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        console.log('Redirecting to:', redirectUrl);
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Status: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      console.log('Total file size:', totalSize);

      const file = fs.createWriteStream(dest);
      response.pipe(file);

      let downloadedSize = 0;
      let lastPercent = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          if (percent - lastPercent >= 10 || percent === 100) {
            console.log(`Download progress: ${percent}% (${downloadedSize}/${totalSize} bytes)`);
            lastPercent = percent;
          }
        } else {
          console.log(`Downloaded ${downloadedSize} bytes`);
        }
      });

      file.on('finish', () => {
        file.close();
        console.log('File write complete.');
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  const tempZip = path.join(process.cwd(), 'repo.zip');
  console.log('Downloading from:', ZIP_URL);
  await downloadFile(ZIP_URL, tempZip);
  console.log('Download complete.');

  console.log('Extracting and moving files directly...');
  const zip = new AdmZip(tempZip);
  const zipEntries = zip.getEntries();

  const matchPath = 'artifacts/structural-app/';
  let extractedCount = 0;

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;
    
    const idx = entry.entryName.indexOf(matchPath);
    if (idx !== -1) {
      const relPath = entry.entryName.substring(idx + matchPath.length);
      if (!relPath) continue;

      const destPath = path.join(process.cwd(), relPath);
      const destDir = path.dirname(destPath);

      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, entry.getData());
      extractedCount++;
    }
  }

  console.log(`Successfully extracted ${extractedCount} files.`);
  fs.unlinkSync(tempZip);
  console.log('Workspace restored successfully!');
}

main().catch(err => {
  console.error('Fatal error during download/extraction:', err);
});
