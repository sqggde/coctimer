const https = require('https');
const auth = Buffer.from('sqggdeyouxiang@126.com:a25vwhvj3ejzyabx').toString('base64');
console.log('Auth prefix:', auth.substring(0,20)+'...');
// PUT a test file to root
const content = JSON.stringify({test:1, time: Date.now()});
const opts = {
  hostname: 'dav.jianguoyun.com',
  path: '/dav/_coc_direct_test.json',
  method: 'PUT',
  headers: {
    'Authorization': 'Basic ' + auth,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(content)
  }
};
const req = https.request(opts, r => {
  let b='';
  r.on('data', c => b += c);
  r.on('end', () => {
    console.log('PUT Status:', r.statusCode);
    console.log('PUT Body:', b);
    // Try MKCOL
    const mkcol = https.request({
      hostname: 'dav.jianguoyun.com',
      path: '/dav/COC_Timer/',
      method: 'MKCOL',
      headers: { 'Authorization': 'Basic ' + auth }
    }, mr => {
      let mb='';
      mr.on('data', c => mb += c);
      mr.on('end', () => {
        console.log('MKCOL Status:', mr.statusCode);
        console.log('MKCOL Body:', mb);
      });
    });
    mkcol.on('error', e => console.log('MKCOL Error:', e.message));
    mkcol.end();
  });
});
req.on('error', e => console.error('Error:', e.message));
req.write(content);
req.end();
