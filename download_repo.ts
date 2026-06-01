import https from 'https';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const ZIP_URL = 'https://github.com/adhmalghwly2050-maker/foundation-designer-pro-dd7dc040/archive/refs/heads/main.zip';

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Status: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
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

  // Find the subproject folder: e.g. "foundation-designer-pro-dd7dc040-main/artifacts/structural-app/"
  const matchPath = 'artifacts/structural-app/';
  let extractedCount = 0;

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;
    
    // Find where the entry matches our structural-app subproject
    const idx = entry.entryName.indexOf(matchPath);
    if (idx !== -1) {
      // Get path relative to structural-app/
      const relPath = entry.entryName.substring(idx + matchPath.length);
      if (!relPath) continue;

      const destPath = path.join(process.cwd(), relPath);
      const destDir = path.dirname(destPath);

      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, entry.getData());
      extractedCount++;
    }
  }

  console.log(`Extracted ${extractedCount} files from structural-app directly to workspace root.`);
  fs.unlinkSync(tempZip);
  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
