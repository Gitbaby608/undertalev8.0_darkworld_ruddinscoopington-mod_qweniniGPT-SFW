// Verifies: fresh texImage2D(canvas) uploads every frame (no copyTexSubImage backbuffer trick),
// mask canvas MC uploaded alongside, #c is visible (not display:none).
const {JSDOM}=require('fs')&&require('jsdom');const fs=require('fs');
function mk2d(){const noop=()=>{};return{fillStyle:'#000',strokeStyle:'#000',lineWidth:1,globalAlpha:1,lineCap:'',textAlign:'',textBaseline:'',font:'',canvas:null,setTransform:noop,transform:noop,scale:noop,translate:noop,rotate:noop,save:noop,restore:noop,beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,rect:noop,fill:noop,stroke:noop,fillRect:noop,clearRect:noop,strokeRect:noop,fillText:noop,arcTo:noop,quadraticCurveTo:noop,measureText:()=>({width:10}),drawImage:noop,createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:noop}}
let canvasUploads=0,copyTex=0,uploadTargets=[];
function mkGL(){const ctx={createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,getShaderInfoLog:()=>'',
 createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,getProgramInfoLog:()=>'',
 useProgram:()=>{},getUniformLocation:(p,n)=>({__u:n}),getAttribLocation:()=>0,enableVertexAttribArray:()=>{},bindBuffer:()=>{},bufferData:()=>{},viewport:()=>{},
 disable:()=>{},enable:()=>{},blendFunc:()=>{},activeTexture:()=>{},bindTexture:()=>{},bindFramebuffer:()=>{},createTexture:()=>({}),texParameteri:()=>{},
 texImage2D:function(){const a=[...arguments];const h=a[a.length-1];if(h&&h.tagName==='CANVAS'){canvasUploads++;uploadTargets.push(h.id||h.__mk||'anon')}else if(a.length===9){console.log('DBG null-upload arity',a.length)}},
 copyTexSubImage2D:()=>{copyTex++},framebufferTexture2D:()=>{},createFramebuffer:()=>({}),createBuffer:()=>({}),vertexAttribPointer:()=>{},
 checkFramebufferStatus:()=>36053,isContextLost:()=>false,uniform1f:()=>{},uniform2f:()=>{},uniform1i:()=>{},pixelStorei:()=>{},drawArrays:()=>{},getError:()=>0};
 return new Proxy(ctx,{get(t,k){if(k in t)return t[k];return k==='FRAMEBUFFER_COMPLETE'?36053:1}});}
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only'});const win=dom.window;
win.HTMLCanvasElement.prototype.getContext=function(kind){if(kind==='2d'){const c=mk2d();c.canvas=this;return c}this.__gl=mkGL();return this.__gl};
win.Audio=function(){return{play:()=>Promise.resolve(),pause:()=>{},load:()=>{}}};
win.SpeechSynthesisUtterance=function(){};win.speechSynthesis={cancel:()=>{},speak:()=>{}};
win.indexedDB={open:()=>{throw 0}};win.requestAnimationFrame=cb=>{win.__raf.push(cb);return 1};win.__raf=[];
win.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
win.document.querySelector('#start').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
for(let i=0;i<20;i++){const cbs=win.__raf;win.__raf=[];for(const cb of cbs)cb(performance.now()+i*16.7)}
console.log('TEST1 per-frame canvas uploads =',canvasUploads,'(expect ~40: scene+mask each frame) ->',canvasUploads>=38?'PASS':'FAIL');
console.log('TEST2 copyTexSubImage2D calls =',copyTex,'-> expect 0:',copyTex===0?'PASS':'FAIL');
console.log('TEST3 distinct upload sources =',new Set(uploadTargets).size,'-> expect 2 (scene + mask):',new Set(uploadTargets).size===2?'PASS':'FAIL');
const cssC=html.match(/#c\{[^}]*\}/)[0];
console.log('TEST4 scene canvas visible:',/position:absolute/.test(cssC)&&!/display:none/.test(cssC)?'PASS':'FAIL ('+cssC+')');
process.exit(0);
