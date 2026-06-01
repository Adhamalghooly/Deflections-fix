import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(process.cwd(), 'imported', 'artifacts', 'structural-app');
const DEST_DIR = process.cwd();

function copyRecursiveSync(src: string, dest: string) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${path.relative(SRC_DIR, src)} -> ${path.relative(DEST_DIR, dest)}`);
  }
}

function main() {
  console.log(`Copying structural-app from ${SRC_DIR} to ${DEST_DIR}...`);
  
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source directory does not exist: ${SRC_DIR}`);
    process.exit(1);
  }

  // Delete root src folder to guarantee clean copy
  const rootSrc = path.join(DEST_DIR, 'src');
  if (fs.existsSync(rootSrc)) {
    console.log('Cleaning existing root src directory...');
    fs.rmSync(rootSrc, { recursive: true, force: true });
  }

  // Delete root public folder if it exists
  const rootPublic = path.join(DEST_DIR, 'public');
  if (fs.existsSync(rootPublic)) {
    console.log('Cleaning existing root public directory...');
    fs.rmSync(rootPublic, { recursive: true, force: true });
  }

  // Copy everything
  copyRecursiveSync(SRC_DIR, DEST_DIR);

  console.log('All files copied successfully!');
}

main();
