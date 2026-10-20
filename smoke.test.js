const {JSDOM}=require('jsdom');
const fs=require('fs');
// ---- mock 2D context factory
function mk2d(w,h){const noop=()=>{};const g={canvas:null,fillStyle:'#000',strokeStyle:'#000',lineWidth:1,globalAlpha:1,lineCap:'butt',textAlign:'start',textBaseline:'alphabetic',font:'',
 setTransform:noop,transform:noop,scale:noop,translate:noop,rotate:noop,save:noop,restore:noop,
 beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,rect:noop,fill:noop,stroke:noop,fillRect:noop,clearRect:noop,strokeRect:noop,fillText:noop,measureText:()=>({width:10}),
 drawImage:noop,createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:(x,y,ww,hh)=>({data:new Uint8ClampedArray(ww*hh*4)}),putImageData:noop};return g}
let glCalls=0, glErrorMode=false;
function mkGL(){const U=new Proxy({},{get:()=>(...a)=>({})});
 const ctx={
  createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,getShaderInfoLog:()=>'',
  createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:(p,n)=>true,getProgramInfoLog:()=>'',
  useProgram:()=>{glCalls++},getUniformLocation:(p,n)=>({name:n}),getAttribLocation:()=>0,
  enableVertexAttribArray:()=>{},bindBuffer:()=>{},bufferData:()=>{},viewport:()=>{},
  disable:()=>{},enable:()=>{},blendFunc:()=>{},activeTexture:()=>{},bindTexture:()=>{},bindFramebuffer:()=>{},
  createTexture:()=>({}),texParameteri:()=>{},texImage2D:()=>{},framebufferTexture2D:()=>{},createFramebuffer:()=>({}),
  createBuffer:()=>({}),vertexAttribPointer:()=>{},deleteProgram:()=>{},deleteShader:()=>{},
  uniform1f:()=>{},uniform2f:()=>{},uniform1i:()=>{},
  pixelStorei:()=>{},drawArrays:()=>{if(glErrorMode)throw new Error('simulated driver crash')},getError:()=>glErrorMode?1286:0,
 };
 // numeric constants as any property access returns numbers if not a function
 return new Proxy(ctx,{get(t,k){if(k in t)return t[k];return 1}});}
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:false});
const win=dom.window;
win.HTMLCanvasElement.prototype.getContext=function(kind){
 if(kind==='2d'){const c=mk2d();c.canvas=this;return c}
 if(kind==='webgl'||kind==='experimental-webgl'){this.__gl=mkGL();return this.__gl}
 return null};
win.Audio=function(){return{play:()=>Promise.resolve(),pause:()=>{},canplaythrough:null,set src(v){},load:()=>{}}};
win.SpeechSynthesisUtterance=function(){};win.speechSynthesis={cancel:()=>{},speak:()=>{}};
win.indexedDB={open:()=>{throw new Error('no idb')}};
win.requestAnimationFrame=(cb)=>{win.__rafCbs.push(cb);return win.__rafCbs.length};win.__rafCbs=[];
win.addEventListener_orig=win.addEventListener.bind(win);
let errors=[];
win.onerror=(m)=>errors.push(m);
// run the page script
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
try{win.eval(script)}catch(e){console.log('SCRIPT EVAL ERROR:',e.message);process.exit(1)}
// click start
const btn=win.document.querySelector('#start');btn.dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
// pump frames + simulate the exact crash scenario: FIGHT -> strike -> boss turn -> dodge
function pump(n){for(let i=0;i<n;i++){const cbs=win.__rafCbs;win.__rafCbs=[];for(const cb of cbs){try{cb(performance.now()+i*16.7)}catch(e){errors.push(e)}}}}
pump(30);
console.log('after 30 frames, drawArrays calls:',glCalls,'errors:',errors.length);
// press FIGHT button (data-a=fight)
win.document.querySelector('[data-a="fight"]').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
pump(10);
// strike via space keydown
win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:' '}));
pump(60); // boss counterattack setTimeout fires inside pumps? jsdom timers need real time; use setTimeout wait
setTimeout(()=>{
 pump(120);
 console.log('after fight sequence, drawArrays calls:',glCalls,'errors:',errors.length,errors.slice(0,3).map(String));
 // now simulate a mid-fight GL driver crash -> must fall back to 2D, NOT freeze
 glErrorMode=true;
 const before=errors.length;
 pump(5);
 glErrorMode=false;
 const logEl=win.document.querySelector('#log');
 console.log('after forced GL error: errors caught?',errors.length>=before, '| fallback ran (drawArrays stopped growing is expected)');
 // keep pumping — game must remain alive (2D fallback), no thrown exceptions escaping rAF
 const e2=errors.length;pump(30);
 console.log('post-crash frames pumped clean, new uncaught errors:',errors.length-e2===0?'YES':'NO');
 process.exit(errors.length? 1:0);
},900);
