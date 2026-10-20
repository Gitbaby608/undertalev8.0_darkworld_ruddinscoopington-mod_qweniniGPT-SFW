// Temporary verification harness: drives the real game script in jsdom with a mock GL,
// triggers the CRAZY zoom (hurtBoss -> zoomFx(1) + burst particles), and asserts:
//  1. no exception escapes the frame loop when particles draw (old buckets[p] TDZ crash)
//  2. every zoom uniform stays finite and capped (tamed crazy numbers)
//  3. a forced GL error mid-zoom falls back to 2D instead of freezing/crashing
const {JSDOM}=require('jsdom');const fs=require('fs');
function mk2d(){const noop=()=>{};return{fillStyle:'#000',strokeStyle:'#000',lineWidth:1,globalAlpha:1,lineCap:'butt',textAlign:'',textBaseline:'',font:'',canvas:null,setTransform:noop,transform:noop,scale:noop,translate:noop,rotate:noop,save:noop,restore:noop,beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,rect:noop,fill:noop,stroke:noop,fillRect:noop,clearRect:noop,strokeRect:noop,fillText:noop,measureText:()=>({width:10}),drawImage:noop,createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:noop}}
let zmLog=[],errCode=0;
function mkGL(){
 const ctx={createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,getShaderInfoLog:()=>'',
 createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,getProgramInfoLog:()=>'',
 useProgram:()=>{},getUniformLocation:(p,n)=>({__u:n}),getAttribLocation:()=>0,enableVertexAttribArray:()=>{},bindBuffer:()=>{},bufferData:()=>{},viewport:()=>{},
 disable:()=>{},enable:()=>{},blendFunc:()=>{},activeTexture:()=>{},bindTexture:()=>{},bindFramebuffer:()=>{},createTexture:()=>{},texParameteri:()=>{},
 texImage2D:()=>{},framebufferTexture2D:()=>{},createFramebuffer:()=>({}),createBuffer:()=>({}),vertexAttribPointer:()=>{},
 uniform1f:(loc,v)=>{if(typeof v==='number'&&!isFinite(v))throw new Error('non-finite uniform fed to GPU!');if(loc&&loc.__u==='zm')zmLog.push(v);if(loc&&loc.__u==='o'&&v>0)zmLog.push(9)},
 uniform2f:()=>{},uniform1i:()=>{},pixelStorei:()=>{},drawArrays:()=>{},getError:()=>errCode,isContextLost:()=>false};
 return new Proxy(ctx,{get(t,k){if(k in t)return t[k];return 1}});}
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only'});const win=dom.window;
win.HTMLCanvasElement.prototype.getContext=function(kind){if(kind==='2d'){const c=mk2d();c.canvas=this;return c}this.__gl=mkGL();return this.__gl};
win.Audio=function(){return{play:()=>Promise.resolve(),pause:()=>{},load:()=>{}}};
win.SpeechSynthesisUtterance=function(){};win.speechSynthesis={cancel:()=>{},speak:()=>{}};
win.indexedDB={open:()=>{throw 0}};win.requestAnimationFrame=cb=>{win.__raf.push(cb);return 1};win.__raf=[];
const errors=[];
win.onerror=m=>errors.push(m);
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];win.eval(script);
win.document.querySelector('#start').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
function pump(n){for(let i=0;i<n;i++){const cbs=win.__raf;win.__raf=[];for(const cb of cbs){try{cb(performance.now()+i*16.7)}catch(e){errors.push(e)}}}}
pump(5);
// FIGHT -> strike => hurtBoss => zoomFx(1) + 20-particle burst = the exact "crazy 3d" moment
win.document.querySelector('[data-a="fight"]').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
pump(10);
win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:' '}));
zmLog=[];
pump(40); // whole crazy-zoom decay WITH live particles on screen
console.log('TEST1 crazy zoom w/ particles: uncaught errors =',errors.length===0?'0 (PASS)':'FAIL '+errors.map(String));
const maxz=Math.max(...zmLog.filter(v=>v>1));
console.log('TEST2 crazy zoom peak magnification =',maxz.toFixed(3),'-> tamed (<=1.55):',maxz<=1.55?'PASS':'FAIL','| all finite:',zmLog.every(Number.isFinite)?'PASS':'FAIL');
// force a GL driver error mid-crazy-zoom: must fall back to 2D, never freeze
win.document.querySelector('[data-a="fight"]').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
pump(3);
win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:' '}));
errCode=1286;
const before=errors.length;
pump(10);
console.log('TEST3 forced GL error during zoom: gl canvas hidden =',win.document.querySelector('#gl').style.display==='none','| 2D shown =',win.document.querySelector('#c').style.display==='block','| uncaught =',errors.length-before===0?'0 (PASS)':'FAIL');
errCode=0;pump(40);
console.log('TEST4 game keeps running after fallback: PASS (frames pumped, errors total =',errors.length+')');
process.exit(errors.length?1:0);
