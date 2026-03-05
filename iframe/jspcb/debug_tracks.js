
const fs = require('fs');
const path = require('path');

// Load dsn2pcb.js (needs some mocking)
global.js_pcb = {};

// Read dsn2pcb.js
let dsn2pcbContent = fs.readFileSync('d:\\桌面\\js-pcb\\JS-PCB-master\\dsn2pcb.js', 'utf-8');
// Force it to use the global object
dsn2pcbContent = dsn2pcbContent.replace('var js_pcb = js_pcb || {};', 'var js_pcb = global.js_pcb;');
eval(dsn2pcbContent);

const dsnPath = 'd:\\桌面\\js-pcb\\JS-PCB-master\\jlc-file\\示例.dsn';
const dsnContent = fs.readFileSync(dsnPath, 'utf-8');

console.log('DSN Content Length:', dsnContent.length);
console.log('DSN First 100 chars:', dsnContent.substring(0, 100));

const [dims, tracks] = js_pcb.dsn2pcb(dsnContent, 1);

console.log('Total tracks:', tracks.length);

tracks.forEach((track, i) => {
    const terminals = track[3];
    console.log(`Track ${i}: ${terminals.length} terminals, ${track[4].length} paths`);
    if (terminals.length > 0) {
        const x = terminals[0][2][0];
        const y = terminals[0][2][1];
        console.log(`  First term: (${x}, ${y})`);
    }
});
