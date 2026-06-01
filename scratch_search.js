import fs from 'fs';
import path from 'path';

const filePath = './public/main.js';
const content = fs.readFileSync(filePath, 'utf-8');

const query = 'room-options-dropdown';
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes(query)) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
