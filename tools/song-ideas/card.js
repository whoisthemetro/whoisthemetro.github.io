// renders tools/song-ideas/card.html into song-ideas/card.png (1200x630 link preview) and
// song-ideas/icon.png (512, home-screen / message icon). needs the local server on :8123.
// usage: node tools/song-ideas/card.js   (puppeteer-core lives in ~/metro-smoke), then:
//   sips -s format jpeg -s formatOptions 86 song-ideas/card.png --out song-ideas/card.jpg && rm song-ideas/card.png
//   sips -Z 180 song-ideas/icon.png --out song-ideas/apple-touch-icon.png; sips -Z 64 song-ideas/icon.png --out song-ideas/favicon.png
// and bump the ?v= on og:image in BOTH song-ideas/index.html and the whoisthemetro/songs repo — previews cache hard.
const path=require('path'),os=require('os');
const puppeteer=require(path.join(os.homedir(),'metro-smoke/node_modules/puppeteer-core'));
const out=path.join(__dirname,'..','..','song-ideas');
(async()=>{
  const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox','--use-gl=angle']});
  for(const [q,w,h,file] of [['',1200,630,'card.png'],['?icon',512,512,'icon.png']]){
    const p=await b.newPage();await p.setViewport({width:w,height:h,deviceScaleFactor:1});
    await p.goto(`http://localhost:8123/tools/song-ideas/card.html${q}`,{waitUntil:'networkidle0'});
    await p.waitForFunction('document.body.dataset.ready&&document.fonts.status==="loaded"');
    await new Promise(r=>setTimeout(r,800));   // a few shader frames
    await p.screenshot({path:path.join(out,file)});console.log('wrote',file);
  }
  await b.close();
})();
