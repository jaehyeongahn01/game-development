import { statSync, readdirSync } from 'node:fs';
const LIMIT = 4 * 1024 * 1024;
const files = readdirSync('dist');
if (files.length !== 1 || files[0] !== 'index.html') {
  console.error('dist 안에 index.html 외의 파일이 있습니다:', files);
  process.exit(1);
}
const size = statSync('dist/index.html').size;
console.log(`dist/index.html = ${(size / 1024).toFixed(1)} KB (한도 ${LIMIT / 1024} KB)`);
if (size > LIMIT) { console.error('4MB 한도를 초과했습니다.'); process.exit(1); }

import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'Slicer-and-Dodger.html');
console.log('실행 파일 생성: Slicer-and-Dodger.html');
