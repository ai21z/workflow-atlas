const fs=require('node:fs');const path=require('node:path');
const folder=path.resolve(__dirname,'../atlas');
const read=p=>fs.readFileSync(path.join(folder,p),'utf8');
const moduleURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const modules={
 'three-core':moduleURL(read('vendor/three.core.js')),
 'three':moduleURL(read('vendor/three.module.js').replaceAll("'./three.core.js'","'three-core'")),
 'atlas-orbit':moduleURL(read('vendor/OrbitControls.js')),
 'atlas-graph':moduleURL(read('graph.mjs').replace("'./vendor/three.module.js'","'three'").replace("'./vendor/OrbitControls.js'","'atlas-orbit'"))
};
const safe=s=>s.replace(/<\/script/gi,'<\\/script');
let html=read('index.html').replace('<link rel="stylesheet" href="styles.css">','<style>'+read('styles.css')+'</style>').replace(/<a data-factory-link[^>]*>.*?<\/a>/,'');
html=html.replace(/<script type="importmap">.*?<\/script>/,'<script type="importmap">'+JSON.stringify({imports:modules})+'</script>');
html=html.replace(/  <script defer src="(?:data|app)\.js"><\/script>\r?\n/g,'');
html=html.replace('</body>','<!-- Three.js r180 and OrbitControls are bundled under the MIT license.\n'+read('vendor/THREE-LICENSE.txt')+'\n--><script>'+safe(read('data.js'))+'</script><script>'+safe(read('app.js').replace("import('./graph.mjs')","import('atlas-graph')"))+'</script>\n</body>');
const output=path.resolve(__dirname,'../exports/Workflow Atlas.html');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,html);console.log(JSON.stringify({file:output,bytes:Buffer.byteLength(html)}));
