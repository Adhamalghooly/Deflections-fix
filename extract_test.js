import AdmZip from 'adm-zip';
import fs from 'fs';

function main() {
  if (!fs.existsSync('repo.zip')) {
    console.log('repo.zip does not exist.');
    return;
  }
  const size = fs.statSync('repo.zip').size;
  console.log('Local repo.zip exists. Size:', size);

  if (size < 1000) {
    console.log('File content:', fs.readFileSync('repo.zip', 'utf8').substring(0, 500));
    return;
  }

  try {
    const zip = new AdmZip('repo.zip');
    const entries = zip.getEntries();
    console.log('ZIP loaded successfully! Total entries:', entries.length);
  } catch (err) {
    console.error('ZIP loading failed:', err.message);
  }
}

main();
