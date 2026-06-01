import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

try {
  console.log('Extracting local repo.zip...');
  const zip = new AdmZip('repo.zip');
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
} catch (err) {
  console.error("Extraction error:", err);
}
