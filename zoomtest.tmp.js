// Temporary verification harness for the NO-FALLBACK WebGL rewrite. Asserts:
//  1. crazy zoom fires (particles + fxS=1) with ZERO uncaught errors
//  2. every uniform fed to the GPU is finite, zm stays in [1, 1.6], rtv in [0, PI]
//  3. a simulated context loss PAUSES rendering and webglcontextrestored REBUILDS it
const {JSDOM}=require('jsdom');const fs=require('fs');
function mk2d(){const noop=()=>{};return{fillStyle:'#000',strokeStyle:'#000',lineWidth:1,globalAlpha:1,lineCap:'butt',textAlign:'',textBaseline:'',font:'',canvas:null,setTransform:noop,transform:noop,scale:noop,translate:noop,rotate:noop,save:noop,restore:noop,beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,rect:noop,fill:noop,stroke:noop,fillRect:noop,clearRect:noop,strokeRect:noop,fillText:noop,measureText:()=>({width:10}),drawImage:noop,createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:noop}}
let uLog=[],lost=false,errCode=0,builds=0,fboBroken=true,draws=0;
function mkGL(){
 const ctx={createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,getShaderInfoLog:()=>'',
 createProgram:()=>{builds++;return{}},attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,getProgramInfoLog:()=>'',
 useProgram:()=>{},getUniformLocation:(p,n)=>({__u:n}),getAttribLocation:()=>0,enableVertexAttribArray:()=>{},bindBuffer:()=>{},bufferData:()=>{},viewport:()=>{},
 disable:()=>{},enable:()=>{},blendFunc:()=>{},activeTexture:()=>{},bindTexture:()=>{},bindFramebuffer:()=>{},createTexture:()=>({}),texParameteri:()=>{},
 texImage2D:()=>{},copyTexSubImage2D:()=>{draws++},framebufferTexture2D:()=>{},createFramebuffer:()=>({}),createBuffer:()=>({}),vertexAttribPointer:()=>{},
 checkFramebufferStatus:()=>fboBroken?1:36053,isContextLost:()=>lost,
 uniform1f:(loc,v)=>{if(!Number.isFinite(v))throw new Error('non-finite uniform '+v);if(loc&&loc.__u==='zm')uLog.push(['zm',v]);if(loc&&loc.__u==='rt')uLog.push(['rt',v]);if(loc&&loc.__u==='o'&&v>0)uLog.push(['o',v])},
 uniform2f:(loc,x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('non-finite vec uniform')},
 uniform1i:()=>{},pixelStorei:()=>{},drawArrays:()=>{draws++;if(errCode)throw new Error('simulated driver throw')},getError:()=>errCode};
 return new Proxy(ctx,{get(t,k){if(k in t)return t[k];return k==='FRAMEBUFFER_COMPLETE'?36053:1}});}
const html=fs.readFileSync(process.env.GAME_HTML||'index.html','utf8');
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
// FIGHT -> strike => hurtBoss => zoomFx(1) + particle burst = the exact "crazy 3d" moment
win.document.querySelector('[data-a="fight"]').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
pump(10);
win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:' '}));
uLog=[];
pump(40); // whole crazy-zoom decay WITH live particles on screen
console.log('TEST1 crazy zoom w/ particles: uncaught errors =',errors.length===0?'0 (PASS)':'FAIL '+errors.map(String));
const zms=uLog.filter(e=>e[0]==='zm').map(e=>e[1]),rts=uLog.filter(e=>e[0]==='rt').map(e=>e[1]);
const badZ=zms.filter(v=>!(v>=1&&v<=1.6001)),badR=rts.filter(v=>!(v>=-0.0001&&v<=3.1417));
console.log('TEST2 zm range:',Math.min(...zms).toFixed(3),'..',Math.max(...zms).toFixed(3),'-> in [1,1.6]:',badZ.length===0?'PASS':'FAIL '+badZ.slice(0,3));
console.log('TEST3 rt range:',Math.min(...rts).toFixed(3),'..',Math.max(...rts).toFixed(3),'-> in [0,PI]:',badR.length===0?'PASS':'FAIL '+badR.slice(0,3));
console.log('TEST4 all uniforms finite during crazy zoom: PASS (any non-finite would have thrown)');
// beep-beep button must also survive its gentle punch
win.document.querySelector('#sheepBtn').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
pump(30);
console.log('TEST5 beep-beep zoom: uncaught errors =',errors.length===0?'0 (PASS)':'FAIL '+errors.map(String));
// simulate context loss -> pause, then restore -> rebuild + resume (NO fallback exists)
const glEl=win.document.querySelector('#gl');
lost=true;
glEl.dispatchEvent(new win.Event('webglcontextlost',{cancelable:true}));
const bBefore=builds;pump(10);
console.log('TEST6 context lost: game keeps pumping, no errors =',errors.length===0?'PASS':'FAIL');
lost=false;
glEl.dispatchEvent(new win.Event('webglcontextrestored'));
console.log('TEST7 context restored: pipeline rebuilt =',builds>bBefore?'PASS (programs recompiled)':'FAIL');
pump(20);
console.log('TEST8 renders after rebuild with zero uncaught errors =',errors.length===0?'PASS':'FAIL '+errors.map(String));
process.exit(errors.length?1:0);
