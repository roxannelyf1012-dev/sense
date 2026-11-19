const installation=document.querySelector('#landing-screen');
const canvas=document.querySelector('#thermal-field');
const ring=document.querySelector('#scan-ring');
const scanLabel=document.querySelector('#scan-label');
const signalLabel=document.querySelector('#signal-label');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={w:0,h:0,dpr:1,x:.5,y:.5,active:false,intensity:0,time:0,last:0,raf:0,mouseX:.5,mouseY:.5,scanRadius:.205};
const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'high-performance'});

if(!gl){
  scanLabel.innerHTML='<span></span> THERMAL SCAN / WEBGL UNAVAILABLE';
}else{
  const vertex=`
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.0,1.0);}`;
  const fragment=`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uImage;
    uniform vec2 uResolution;
    uniform vec2 uImageResolution;
    uniform vec2 uPointer;
    uniform float uRadius;
    uniform float uIntensity;
    uniform float uTime;
    vec3 thermal(float h){
      vec3 c=mix(vec3(.004,.003,.008),vec3(.20,.004,.018),smoothstep(.015,.24,h));
      c=mix(c,vec3(.92,.012,.035),smoothstep(.24,.47,h));
      c=mix(c,vec3(1.0,.20,.025),smoothstep(.47,.65,h));
      c=mix(c,vec3(1.0,.72,.14),smoothstep(.65,.83,h));
      c=mix(c,vec3(1.0,.98,.91),smoothstep(.83,1.0,h));
      return c;
    }
    void main(){
      float viewAspect=uResolution.x/uResolution.y,imageAspect=uImageResolution.x/uImageResolution.y;
      vec2 uv=vUv;
      if(viewAspect>imageAspect){float visibleHeight=imageAspect/viewAspect;uv.y=(1.0-visibleHeight)*.5+uv.y*visibleHeight;}
      else{float visibleWidth=viewAspect/imageAspect;uv.x=(1.0-visibleWidth)*.5+uv.x*visibleWidth;}
      vec4 src=texture2D(uImage,uv);
      float luma=dot(src.rgb,vec3(.299,.587,.114));
      float redCue=max(0.0,src.r-max(src.g,src.b));
      // Translate image detail into a true thermal palette rather than just
      // lifting its brightness: shadows stay dark, warm structure turns red,
      // and the hottest highlights pass through orange/yellow into white.
      float heat=clamp(pow(luma,.62)*.88+redCue*.58,0.0,1.0);
      float aspect=uResolution.x/uResolution.y;
      vec2 delta=vec2((vUv.x-uPointer.x)*aspect,vUv.y-uPointer.y);
      float d=length(delta);
      float edge=1.0-smoothstep(uRadius*.72,uRadius*1.08,d);
      float rim=exp(-pow((d-uRadius*.91)/.018,2.0));
      float grain=sin((vUv.x*911.0+vUv.y*617.0)+uTime*2.1)*.018;
      float localHeat=clamp(heat+grain+rim*.025,0.0,1.0);
      float alpha=edge*uIntensity*smoothstep(.035,.17,luma)*.97;
      vec3 mapped=thermal(localHeat);
      gl_FragColor=vec4(mapped,alpha);
    }`;
  function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Thermal shader failed');return shader;}
  try{
    const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Thermal shader link failed');
    gl.useProgram(program);
    const loc={position:gl.getAttribLocation(program,'aPosition'),image:gl.getUniformLocation(program,'uImage'),resolution:gl.getUniformLocation(program,'uResolution'),imageResolution:gl.getUniformLocation(program,'uImageResolution'),pointer:gl.getUniformLocation(program,'uPointer'),radius:gl.getUniformLocation(program,'uRadius'),intensity:gl.getUniformLocation(program,'uIntensity'),time:gl.getUniformLocation(program,'uTime')};
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(loc.position);gl.vertexAttribPointer(loc.position,2,gl.FLOAT,false,0,0);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const image=new Image();image.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform1i(loc.image,0);state.imageResolution=[image.naturalWidth,image.naturalHeight];state.imageReady=true;scanLabel.innerHTML='<span></span> INFRARED FIELD / READY';};image.onerror=()=>{scanLabel.innerHTML='<span></span> THERMAL IMAGE / UNAVAILABLE';};image.src='./assets/serpent-particle-reference.png';
    state.program=program;state.texture=texture;state.loc=loc;state.buffer=buffer;
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);resize();state.raf=requestAnimationFrame(render);
  }catch(error){scanLabel.innerHTML=`<span></span> SCAN UNAVAILABLE / ${error.message}`;}
}

function resize(){
  state.w=innerWidth;state.h=innerHeight;state.dpr=Math.min(devicePixelRatio||1,state.w<700?1.2:1.45);
  canvas.width=Math.round(state.w*state.dpr);canvas.height=Math.round(state.h*state.dpr);
  if(gl){gl.viewport(0,0,canvas.width,canvas.height);if(state.program)gl.useProgram(state.program);}
}
function pointerAt(event){
  if(installation.classList.contains('is-leaving'))return;
  const x=clamp(event.clientX/state.w,0,1),y=clamp(event.clientY/state.h,0,1);
  state.x=x;state.y=y;state.mouseX=x;state.mouseY=y;state.active=true;state.intensity=1;
  document.documentElement.style.setProperty('--scan-x',`${event.clientX}px`);
  document.documentElement.style.setProperty('--scan-y',`${event.clientY}px`);
  const radius=Math.min(168,Math.max(100,state.h*.164));state.scanRadius=radius/state.h;document.documentElement.style.setProperty('--scan-radius',`${radius}px`);
  installation.classList.add('scanning');
  const nearPit=Math.hypot((x-.54)*state.w,(y-.26)*state.h)<radius;
  scanLabel.innerHTML=nearPit?'<span></span> LOREAL PIT / HEAT CUE':'<span></span> THERMAL FIELD / SCANNING';
  signalLabel.textContent=nearPit?'WARM SIGNAL / DETECTED':'THERMAL SCAN / ACTIVE';
  if(!reduced.matches){document.documentElement.style.setProperty('--drift-x',`${(x-.5)*10}px`);document.documentElement.style.setProperty('--drift-y',`${(y-.5)*7}px`);}
}
function render(now){
  if(!gl||!state.program)return;
  const dt=Math.min(.05,Math.max(.008,(now-(state.last||now))*.001));state.last=now;state.time+=dt;
  if(!state.active)state.intensity=Math.max(0,state.intensity-dt*.58);
  if(state.intensity<.01){state.intensity=0;installation.classList.remove('scanning');signalLabel.textContent='THERMAL SCAN / READY';scanLabel.innerHTML='<span></span> INFRARED FIELD / READY';document.documentElement.style.setProperty('--drift-x','0px');document.documentElement.style.setProperty('--drift-y','0px');}
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(state.program);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,state.texture);
  gl.uniform2f(state.loc.resolution,canvas.width,canvas.height);gl.uniform2f(state.loc.imageResolution,...(state.imageResolution||[1200,850]));gl.uniform2f(state.loc.pointer,state.x,1-state.y);gl.uniform1f(state.loc.radius,state.scanRadius);gl.uniform1f(state.loc.intensity,state.intensity);gl.uniform1f(state.loc.time,state.time);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);state.raf=requestAnimationFrame(render);
}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
document.addEventListener('pointermove',pointerAt,{passive:true});
document.addEventListener('pointerdown',pointerAt,{passive:true});
document.addEventListener('pointerleave',()=>{state.active=false;},{passive:true});
window.addEventListener('blur',()=>{state.active=false;},{passive:true});
window.addEventListener('resize',resize,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(state.raf);state.raf=0;}else if(!installation.classList.contains('is-leaving')&&gl&&state.program&&!state.raf)state.raf=requestAnimationFrame(render);});

// First-person pit-organ experience.
const experience=document.querySelector('#experience-screen');
const experienceCanvas=document.querySelector('#experience-canvas');
const experienceContext=experienceCanvas.getContext('2d',{alpha:false,desynchronized:true});
const startButton=document.querySelector('#start-sensing');
const strikeButton=document.querySelector('#strike-button');
const senseAgainButton=document.querySelector('#sense-again');
const ending=document.querySelector('#ending');
const preyReadout=document.querySelector('#prey-readout');
const experienceInstruction=document.querySelector('#experience-instruction');
const settingsToggle=document.querySelector('#settings-toggle');
const soundToggle=document.querySelector('#sound-toggle');
const resetButton=document.querySelector('#reset-experience');
const settingsPanel=document.querySelector('#settings-panel');
const experienceState={width:0,height:0,dpr:1,lastTime:0,frame:0,residueUntil:0,running:false,started:false,ended:false,settings:{size:'M',density:'MID',trail:3,thermal:'MID',movement:'SOFT',sound:true},mouse:{x:-1000,y:-1000,heatX:-1000,heatY:-1000,previousX:-1000,previousY:-1000,seen:false,speed:0,moveTime:0},ambient:[],trail:[],sonars:[],thermalCanvas:null,thermalContext:null,prey:{x:.72,y:.52,targetX:.72,targetY:.52,points:[],fieldPoints:[],corePoints:[],reveal:0,scatteredUntil:0,ready:false,steady:0},audio:null};
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const rocks=[
  [[.07,.66],[.10,.58],[.14,.55],[.18,.58],[.20,.69],[.16,.73],[.11,.72],[.07,.66]],
  [[.26,.82],[.29,.75],[.35,.74],[.39,.79],[.38,.86],[.31,.89],[.27,.86],[.26,.82]],
  [[.61,.78],[.65,.70],[.71,.72],[.75,.79],[.73,.85],[.67,.87],[.62,.83],[.61,.78]],
  [[.84,.59],[.87,.53],[.92,.54],[.96,.61],[.95,.68],[.89,.69],[.85,.65],[.84,.59]],
  [[.42,.57],[.45,.51],[.49,.52],[.52,.58],[.50,.64],[.45,.64],[.42,.57]]
];
function randomBetween(min,max){return min+Math.random()*(max-min);}
function makeAmbientParticle(){return{x:Math.random()*experienceState.width,y:Math.random()*experienceState.height,z:randomBetween(.35,1.8),vx:randomBetween(-.14,.14),vy:randomBetween(-.12,.12),phase:Math.random()*Math.PI*2,size:randomBetween(.35,1.15),alpha:randomBetween(.12,.42)};}
let mouseReferenceCandidates=[];
function loadMouseReference(){
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      try{
        const sampleCanvas=document.createElement('canvas'),sampleContext=sampleCanvas.getContext('2d',{willReadFrequently:true});
        sampleCanvas.width=768;sampleCanvas.height=512;sampleContext.drawImage(image,0,0,768,512);
    const data=sampleContext.getImageData(0,0,768,512).data,candidates=[];
        for(let y=100;y<430;y+=2){for(let x=8;x<760;x+=2){
          const offset=(y*768+x)*4,luma=data[offset]*.299+data[offset+1]*.587+data[offset+2]*.114;
          if(luma<78)continue;
          let hash=(x*374761393+y*668265263)>>>0;hash=Math.imul(hash^(hash>>>13),1274126177)>>>0;hash^=hash>>>16;
          const tone=clamp((luma-78)/177,0,1);
          candidates.push({x:(x-384)/360,y:(y-270)/360,tone,phase:(hash%100000)/100000*Math.PI*2,order:hash/4294967295,size:.72+((hash>>>8)%1000)/1000*.46});
        }}
        candidates.sort((a,b)=>a.order-b.order);mouseReferenceCandidates=candidates;
      }catch(error){mouseReferenceCandidates=[];}
      resolve();
    };
    image.onerror=()=>resolve();image.src='./assets/mouse-thermal-reference.jpg';
  });
}
const mouseReferenceReady=loadMouseReference();
function makePreyPoints(){
  const density=experienceState.settings.density;
  if(mouseReferenceCandidates.length){
    const targetCount=Math.min({LOW:2800,MID:5600,HIGH:8000}[density],mouseReferenceCandidates.length),stride=mouseReferenceCandidates.length/targetCount,points=[];
    for(let i=0;i<targetCount;i++){const source=mouseReferenceCandidates[Math.floor(i*stride)];if(source)points.push({x:source.x,y:source.y,tone:source.tone,category:source.tone>.72?1:0,phase:source.phase,depth:Math.sin(source.phase+source.x*5+source.y*7),size:source.size});}
    const spillCount=Math.round(points.length*.56);for(let i=0;i<spillCount;i++){const source=points[Math.floor(i*points.length/spillCount)],radius=Math.hypot(source.x,source.y),angle=Math.atan2(source.y,source.x),spread=randomBetween(1.035,1.22);points.push({x:Math.cos(angle)*radius*spread,y:Math.sin(angle)*radius*spread,tone:source.tone*.78,category:source.category,phase:source.phase+randomBetween(-.5,.5),depth:source.depth,size:source.size,spill:true});}
    return points;
  }
  const points=[],densityFactor={LOW:.62,MID:1,HIGH:1.55}[experienceState.settings.density];
  const ellipse=(count,cx,cy,rx,ry,category)=>{for(let i=0;i<Math.round(count*densityFactor);i++){const angle=Math.random()*Math.PI*2;const radius=Math.sqrt(Math.random());points.push({x:cx+Math.cos(angle)*rx*radius,y:cy+Math.sin(angle)*ry*radius,category,phase:Math.random()*Math.PI*2,depth:randomBetween(-1,1),size:randomBetween(.72,1.18)});}};
  // Compact mouse silhouette: rounded haunches, a tapered head, round ears, and a fine curved tail.
  ellipse(300,-.08,.08,.58,.39,0);
  ellipse(122,.42,-.12,.34,.29,1);
  ellipse(48,.69,-.02,.17,.11,1);
  ellipse(38,.26,-.42,.16,.16,1);
  ellipse(22,.50,-.39,.105,.11,1);
  ellipse(14,.81,-.11,.055,.055,2);
  for(let i=0,count=Math.round(84*densityFactor);i<count;i++){const t=i/Math.max(1,count-1);points.push({x:-.55-t*.94,y:.07+Math.sin(t*Math.PI*.72)*.34+t*.08,category:2,phase:t*6,depth:randomBetween(-.35,.35),size:randomBetween(.72,1.18)});}
  for(const foot of [[-.42,.31],[-.08,.36],[.34,.13],[.58,.10]])for(let i=0,count=Math.round(14*densityFactor);i<count;i++){const t=i/Math.max(1,count-1);points.push({x:foot[0]+t*.14,y:foot[1]+t*.22,category:2,phase:t*4,depth:randomBetween(-.5,.5),size:randomBetween(.72,1.18)});}
  for(let i=0,count=Math.round(20*densityFactor);i<count;i++){const t=i/Math.max(1,count-1);points.push({x:.73+t*.19,y:-.025+Math.sin(t*Math.PI)*.055,category:1,phase:t*4,depth:randomBetween(-.6,.6),size:randomBetween(.72,1.18)});}
  return points;
}
function makeHeatFieldPoints(){
  const count=Math.round(520*{LOW:.62,MID:1,HIGH:1.55}[experienceState.settings.density]);
  return Array.from({length:count},(_,index)=>({angle:Math.random()*Math.PI*2,layer:Math.sqrt(index/count),phase:Math.random()*Math.PI*2,drift:randomBetween(-.72,.72),tone:Math.random(),size:randomBetween(.72,1.18)}));
}
function makeHeatCorePoints(){
  const count=Math.round(82*{LOW:.62,MID:1,HIGH:1.55}[experienceState.settings.density]);
  return Array.from({length:count},()=>{const angle=Math.random()*Math.PI*2,radius=Math.sqrt(Math.random());return{x:Math.cos(angle)*radius*.34,y:Math.sin(angle)*radius*.25,phase:Math.random()*Math.PI*2,size:randomBetween(.72,1.18)};});
}
function makePrey(){return{x:randomBetween(.56,.78),y:randomBetween(.34,.67),targetX:.72,targetY:.52,points:makePreyPoints(),fieldPoints:makeHeatFieldPoints(),corePoints:makeHeatCorePoints(),reveal:0,scatteredUntil:0,ready:false,steady:0};}
function resizeExperience(){
  const s=experienceState;s.width=innerWidth;s.height=innerHeight;s.dpr=Math.min(devicePixelRatio||1,innerWidth<700?1.25:1.6);
  experienceCanvas.width=Math.round(s.width*s.dpr);experienceCanvas.height=Math.round(s.height*s.dpr);experienceContext.setTransform(s.dpr,0,0,s.dpr,0,0);
  const density={LOW:.55,MID:1,HIGH:1.65}[s.settings.density];
  const count=Math.round((reducedMotion.matches?Math.min(420,Math.floor(s.width*s.height/2700)):Math.min(1550,Math.max(520,Math.floor(s.width*s.height/1650))))*density);
  s.ambient=Array.from({length:count},makeAmbientParticle);
  if(!s.thermalCanvas){s.thermalCanvas=document.createElement('canvas');s.thermalContext=s.thermalCanvas.getContext('2d');}
  s.thermalCanvas.width=Math.round(experienceCanvas.width*.68);s.thermalCanvas.height=Math.round(experienceCanvas.height*.68);s.thermalContext.setTransform(s.dpr*.68,0,0,s.dpr*.68,0,0);
  if(s.started&&s.prey.points.length){s.prey.points=makePreyPoints();s.prey.fieldPoints=makeHeatFieldPoints();s.prey.corePoints=makeHeatCorePoints();}
}
async function startExperience(){
  if(experienceState.started)return;experienceState.started=true;experienceState.running=true;
  cancelAnimationFrame(state.raf);state.raf=0;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(AudioContextClass){try{experienceState.audio=new AudioContextClass();experienceState.audio.resume();}catch(error){experienceState.audio=null;}}
  await mouseReferenceReady;
  experience.classList.add('is-active');experience.setAttribute('aria-hidden','false');installation.classList.add('is-leaving');installation.setAttribute('aria-hidden','true');
  resizeExperience();experienceState.prey=makePrey();experienceState.lastTime=performance.now();experienceState.frame=requestAnimationFrame(drawExperience);
}
function spawnTrail(x,y,amount=5,directionX=0,directionY=0,startX=x,startY=y){
  const s=experienceState,density={LOW:.7,MID:1,HIGH:1.35}[s.settings.density],motion=s.settings.movement==='FAST'?1.3:.62;
  s.residueUntil=performance.now()+4000;
  const magnitude=Math.hypot(directionX,directionY),tangentX=magnitude>.5?directionX/magnitude:1,tangentY=magnitude>.5?directionY/magnitude:0,count=Math.max(3,Math.round(amount*12*density));
  for(let i=0;i<count;i++){const along=magnitude>.5?Math.random():1,angle=Math.random()*Math.PI*2,radius=3.2+Math.sqrt(Math.random())*25.6,radialX=Math.cos(angle),radialY=Math.sin(angle),xAlong=startX+directionX*along+radialX*radius,yAlong=startY+directionY*along+radialY*radius,outward=randomBetween(7,24)*motion,swirl=randomBetween(-10,10)*motion,wake=randomBetween(-4,8)*motion;s.trail.push({x:xAlong,y:yAlong,vx:radialX*outward-tangentY*swirl+tangentX*wake,vy:radialY*outward+tangentX*swirl+tangentY*wake,age:0,life:Math.min(4,s.settings.trail*randomBetween(.9,1.12)),size:randomBetween(.72,1.18),heat:1});}
  const maxTrailPoints=Math.round({LOW:17600,MID:35200,HIGH:50000}[s.settings.density]);if(s.trail.length>maxTrailPoints)s.trail.splice(0,s.trail.length-maxTrailPoints);
}
function pointerMove(event){
  const s=experienceState,m=s.mouse,now=performance.now(),x=event.clientX,y=event.clientY,dt=Math.max(.008,(now-(m.moveTime||now))*.001);
  if(m.seen){const dx=x-m.x,dy=y-m.y;m.speed=Math.hypot(dx,dy)/dt;const distance=Math.hypot(dx,dy);spawnTrail(x,y,Math.min(35,Math.max(15,Math.round(distance*.235))),dx,dy,m.x,m.y);}
  else{m.speed=0;m.heatX=x;m.heatY=y;spawnTrail(x,y,15);m.seen=true;}
  m.previousX=m.x;m.previousY=m.y;m.x=x;m.y=y;m.moveTime=now;
}
function playSamplingSound(){
  const audio=experienceState.audio;if(!audio||!experienceState.settings.sound)return;if(audio.state==='suspended')audio.resume();
  const now=audio.currentTime,oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(520,now);oscillator.frequency.exponentialRampToValueAtTime(290,now+.12);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.028,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.16);oscillator.connect(gain).connect(audio.destination);oscillator.start(now);oscillator.stop(now+.17);
}
function triggerSonar(x=experienceState.mouse.x,y=experienceState.mouse.y){
  const s=experienceState;if(!s.started||s.ended)return;
  if(x<0||y<0){x=s.width*.5;y=s.height*.57;}
  s.sonars.push({x,y,age:0,duration:reducedMotion.matches?1.35:1.9,seed:Math.random()*100,particles:Array.from({length:54},(_,index)=>({angle:index/54*Math.PI*2+Math.random()*.025,size:randomBetween(.65,1.35),alpha:randomBetween(.38,.88)}))});
  if(s.sonars.length>5)s.sonars.shift();
  spawnTrail(x,y,34);playSamplingSound();
}
function movePrey(){
  const p=experienceState.prey;let nx=randomBetween(.24,.79),ny=randomBetween(.28,.72);
  if(Math.hypot(nx-p.x,ny-p.y)<.29){nx=nx<.5?.78:.22;ny=randomBetween(.24,.76);}
  p.targetX=nx;p.targetY=ny;p.scatteredUntil=performance.now()+850;p.ready=false;p.steady=0;
  preyReadout.textContent='MOUSE HEAT / SIGNAL DISTURBED';experienceInstruction.textContent='THE WARM SIGNAL HAS MOVED';strikeButton.hidden=true;
}
function playStrikeSound(){
  const audio=experienceState.audio;if(!audio||!experienceState.settings.sound)return;
  if(audio.state==='suspended')audio.resume();const now=audio.currentTime;
  const impact=audio.createOscillator(),impactGain=audio.createGain(),lowpass=audio.createBiquadFilter();impact.type='triangle';impact.frequency.setValueAtTime(92,now);impact.frequency.exponentialRampToValueAtTime(37,now+.42);lowpass.type='lowpass';lowpass.frequency.value=380;impactGain.gain.setValueAtTime(.0001,now);impactGain.gain.exponentialRampToValueAtTime(.24,now+.018);impactGain.gain.exponentialRampToValueAtTime(.0001,now+.48);impact.connect(lowpass).connect(impactGain).connect(audio.destination);impact.start(now);impact.stop(now+.5);
  const length=Math.floor(audio.sampleRate*.42),buffer=audio.createBuffer(1,length,audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);
  const noise=audio.createBufferSource(),rattle=audio.createBiquadFilter(),rattleGain=audio.createGain();noise.buffer=buffer;rattle.type='bandpass';rattle.frequency.value=1550;rattle.Q.value=.8;rattleGain.gain.setValueAtTime(.0001,now);rattleGain.gain.exponentialRampToValueAtTime(.08,now+.015);rattleGain.gain.exponentialRampToValueAtTime(.0001,now+.36);noise.connect(rattle).connect(rattleGain).connect(audio.destination);noise.start(now);noise.stop(now+.4);
}
function strike(){
  const s=experienceState;if(s.ended||!s.prey.ready)return;s.ended=true;playStrikeSound();const p=s.prey,cx=p.x*s.width,cy=p.y*s.height;
  for(let i=0;i<330;i++){const a=Math.random()*Math.PI*2,v=randomBetween(55,590);s.trail.push({x:cx+randomBetween(-18,18),y:cy+randomBetween(-15,15),vx:Math.cos(a)*v,vy:Math.sin(a)*v,age:0,life:randomBetween(1.1,2.5),size:randomBetween(.7,2.3),heat:Math.random()});}
  strikeButton.hidden=true;preyReadout.textContent='SIGNAL / RECEIVED';experienceInstruction.textContent='';setTimeout(()=>{ending.classList.add('is-visible');ending.setAttribute('aria-hidden','false');},700);
}
function senseAgain(){
  const s=experienceState;s.ended=false;s.prey=makePrey();
  s.trail.length=0;s.sonars.length=0;s.mouse.speed=0;s.mouse.seen=false;s.mouse.heatX=-1000;s.mouse.heatY=-1000;s.residueUntil=0;if(s.thermalContext)s.thermalContext.clearRect(0,0,s.width,s.height);ending.classList.remove('is-visible');ending.setAttribute('aria-hidden','true');strikeButton.hidden=true;preyReadout.textContent='';experienceInstruction.textContent='MOVE TO SCAN / MOVE SLOWLY TO REVEAL / CLICK TO SAMPLE';
  if(s.started){s.running=true;s.lastTime=performance.now();cancelAnimationFrame(s.frame);s.frame=requestAnimationFrame(drawExperience);}
}
function applySetting(name,value){
  const s=experienceState;switch(name){
    case 'size':s.settings.size=value;break;
    case 'density':s.settings.density=value;resizeExperience();break;
    case 'trail':s.settings.trail=Number(value);break;
    case 'thermal':s.settings.thermal=value;break;
    case 'movement':s.settings.movement=value;break;
  }
}
function resetExperience(){
  senseAgain();settingsPanel.hidden=true;settingsToggle.setAttribute('aria-expanded','false');
}
function smoothstep(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function heartbeatAt(time){
  const phase=((time*85/60)%1+1)%1;
  const first=Math.exp(-.5*Math.pow(phase/.052,2));
  const second=.57*Math.exp(-.5*Math.pow((phase-.17)/.044,2));
  return Math.max(first,second);
}
function drawAmbient(ctx,s,dt,time){
  const m=s.mouse,w=s.width,h=s.height,motion=s.settings.movement==='FAST'?1.7:.58,size={S:.68,M:1,L:1.42}[s.settings.size];
  for(const p of s.ambient){
    const depth=1.35-p.z*.45,px=p.x+(p.x-w*.5)*(1-depth)*.14+(m.seen?(m.x-w*.5)*.009*(1.9-p.z):0),py=p.y+(p.y-h*.5)*(1-depth)*.14+(m.seen?(m.y-h*.5)*.009*(1.9-p.z):0);
    const dx=px-m.x,dy=py-m.y,d=Math.hypot(dx,dy),force=d<156?(1-d/156):0;
    if(force>.01){p.vx+=dx/(d||1)*force*16*motion*dt;p.vy+=dy/(d||1)*force*16*motion*dt;}
    p.vx+=Math.sin(time*.24+p.phase)*.018*motion*dt;p.vy+=Math.cos(time*.19+p.phase)*.016*motion*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;const friction=Math.pow(.994,dt*60);p.vx*=friction;p.vy*=friction;
    if(p.x<-15)p.x=w+15;if(p.x>w+15)p.x=-15;if(p.y<-15)p.y=h+15;if(p.y>h+15)p.y=-15;
    const near=force*.12,alpha=Math.min(.52,p.alpha+near*.9),particleSize=p.size*depth*size*(1+near*1.7);
    ctx.fillStyle='#111e30';ctx.globalAlpha=alpha;ctx.fillRect(px,py,particleSize,particleSize);
  }
  ctx.globalAlpha=1;
}
function drawRocks(ctx,s,time){
  for(let index=0;index<rocks.length;index++){
    const path=rocks[index],cx=path.reduce((a,p)=>a+p[0],0)/path.length*s.width,cy=path.reduce((a,p)=>a+p[1],0)/path.length*s.height;
    let reveal=0;
    for(const wave of s.sonars){const radius=(wave.age/wave.duration)*Math.max(s.width,s.height)*.83,d=Math.hypot(cx-wave.x,cy-wave.y);reveal=Math.max(reveal,Math.exp(-Math.abs(d-radius)/62)*(1-wave.age/wave.duration));}
    if(reveal<.015)continue;
    ctx.beginPath();path.forEach((point,i)=>{const x=point[0]*s.width,y=point[1]*s.height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();ctx.lineWidth=.7+reveal*.45;ctx.strokeStyle=`rgba(209,224,239,${Math.min(.52,reveal*.52)})`;ctx.stroke();
    ctx.beginPath();ctx.moveTo(path[0][0]*s.width,path[0][1]*s.height);ctx.lineTo(cx,cy);ctx.lineTo(path[3][0]*s.width,path[3][1]*s.height);ctx.strokeStyle=`rgba(255,158,44,${reveal*.18})`;ctx.lineWidth=.45;ctx.stroke();
  }
}
function drawSonars(ctx,s){
  for(const wave of s.sonars){const progress=wave.age/wave.duration,radius=progress*Math.max(s.width,s.height)*.83,fade=1-progress;
    ctx.beginPath();const dots=100;for(let i=0;i<dots;i++){const a=i/dots*Math.PI*2,x=wave.x+Math.cos(a)*radius,y=wave.y+Math.sin(a)*radius;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.strokeStyle='#f3f7ff';ctx.globalAlpha=fade*.16;ctx.lineWidth=.55;ctx.stroke();
    ctx.fillStyle='#fff';for(const point of wave.particles){const x=wave.x+Math.cos(point.angle)*radius,y=wave.y+Math.sin(point.angle)*radius;ctx.globalAlpha=fade*point.alpha;ctx.fillRect(x,y,point.size,point.size);}
  }
  ctx.globalAlpha=1;
}
function drawPrey(ctx,s,dt,time){
  const p=s.prey,m=s.mouse,scale=Math.min(s.width*.14625,s.height*.163125),px=clamp(p.x*s.width,scale,s.width-scale),py=p.y*s.height,senseX=m.heatX>-500?m.heatX:m.x,senseY=m.heatY>-500?m.heatY:m.y,distance=Math.hypot(senseX-px,senseY-py),proximity=1-smoothstep(35,480,distance),pulse=heartbeatAt(time),peak=.62+.38*pulse,thermal={LOW:.64,MID:1,HIGH:1.38}[s.settings.thermal],particleSize={S:.8,M:1.05,L:1.2}[s.settings.size],motion=s.settings.movement==='FAST'?1.35:.52;
  if(performance.now()>p.scatteredUntil){p.x+=(p.targetX-p.x)*Math.min(1,dt*1.7);p.y+=(p.targetY-p.y)*Math.min(1,dt*1.7);}
  const isFast=proximity>.3&&m.speed>720&&performance.now()>p.scatteredUntil&&!s.ended;
  if(isFast)movePrey();
  const reveal=smoothstep(.015,.62,proximity)*(.65+.35*peak);p.reveal+=(reveal-p.reveal)*Math.min(1,dt*8);
  if(p.reveal>.025){const signal=clamp(p.reveal*thermal,0,1),breath=1+.025*pulse+.008*Math.sin(time*.8);
    for(const field of p.fieldPoints){const angle=field.angle+time*field.drift*motion+Math.sin(time*.62+field.phase)*.055,organic=1+Math.sin(field.angle*2+field.phase+time*.48)*.055,radius=1+field.layer*.8+Math.sin(time*.92+field.phase)*.035;const x=px+Math.cos(angle)*scale*radius*organic*breath,y=py+Math.sin(angle)*scale*(.22+field.layer*.32)*organic*breath;const densityPulse=smoothstep(.04,.58,.34+.66*pulse-field.tone*.44),alpha=signal*(.26+field.layer*.4)*(field.tone>.82?peak:.88)*(.48+.52*densityPulse),size=field.size*particleSize;ctx.fillStyle=Math.sin(field.phase+field.angle*2)>0?'#ffffff':'#ff3548';ctx.globalAlpha=alpha*.11;ctx.beginPath();ctx.arc(x,y,size*1.35,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha*.72;ctx.beginPath();ctx.arc(x,y,size*.5,0,Math.PI*2);ctx.fill();}
    for(const point of p.points){const radialPoint=Math.hypot(point.x,point.y),angle=Math.atan2(point.y,point.x)+Math.sin(time*.26+point.phase)*.018,curl=1+Math.sin(angle*5+time*.42+point.phase)*.009,depth=point.depth||0,breathingDepth=Math.sin(time*.58+point.phase)*.006;let x=px+Math.cos(angle)*radialPoint*scale*curl+depth*scale*.026+Math.sin(time*(1.25+point.tone)+point.phase)*(point.spill?1.8:.55),y=py+Math.sin(angle)*radialPoint*scale*curl+depth*scale*.018+Math.cos(time*(1.1+point.tone)+point.phase)*(point.spill?1.5:.55);
      if(performance.now()<p.scatteredUntil){const scatter=Math.min(1,(p.scatteredUntil-performance.now())/850);x+=Math.sin(point.phase*3.4+time*3*motion)*scatter*45;y+=Math.cos(point.phase*2.9+time*4*motion)*scatter*32;}
      const shimmer=.82+.18*Math.sin(time*1.7+point.phase),whiteCore=point.tone>.62&&Math.sin(point.phase+point.x*9+point.y*11)>.08,dotSize=point.size*particleSize,alpha=signal*shimmer*(whiteCore?peak*.86:.82)*(.86+.14*(point.tone||0))*(point.spill?.46:1);ctx.fillStyle=whiteCore?'#ffffff':'#ff3548';ctx.globalAlpha=alpha*.11;ctx.beginPath();ctx.arc(x,y,dotSize*1.35,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha*.72;ctx.beginPath();ctx.arc(x,y,dotSize*.5,0,Math.PI*2);ctx.fill();
    }
    for(const point of p.corePoints){const radial=1+pulse*.035,x=px+point.x*scale*radial,y=py+point.y*scale*radial,size=point.size*particleSize,alpha=signal*(.24+.72*pulse);ctx.fillStyle='#fff';ctx.globalAlpha=alpha*.11;ctx.beginPath();ctx.arc(x,y,size*1.35,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha*.72;ctx.beginPath();ctx.arc(x,y,size*.5,0,Math.PI*2);ctx.fill();}
  }
  ctx.globalAlpha=1;
  m.speed*=Math.pow(.025,dt);
  const slow=m.speed<85&&distance<Math.min(s.width,s.height)*.052&&performance.now()>p.scatteredUntil;
  p.steady=slow?p.steady+dt:Math.max(0,p.steady-dt*1.8);
  p.ready=p.reveal>.82&&p.steady>1.1&&pulse>.86&&!s.ended;
  strikeButton.hidden=!p.ready;
  if(p.ready){experienceInstruction.textContent='HOLD THE WARMTH';preyReadout.textContent='MOUSE / HEARTBEAT 85 BPM';}
  else if(p.reveal>.17){experienceInstruction.textContent=proximity>.45?'EASE CLOSER — HOLD STILL':'WARM SIGNAL / APPROACHING';preyReadout.textContent='MOUSE / HEARTBEAT 85 BPM';
    if(p.reveal>.78&&p.steady<1.1)preyReadout.textContent='MOUSE / HOLD POSITION TO SENSE';}
  else if(performance.now()>p.scatteredUntil&&preyReadout.textContent==='MOUSE HEAT / SIGNAL DISTURBED'&&p.reveal<.05){experienceInstruction.textContent='MOVE TO SCAN / MOVE SLOWLY TO REVEAL / CLICK TO SAMPLE';preyReadout.textContent='';}
}
function drawTrail(ctx,s,dt){
  for(let i=s.trail.length-1;i>=0;i--){const p=s.trail[i];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.16,dt);p.vy*=Math.pow(.16,dt);if(p.age>=p.life){s.trail.splice(i,1);continue;}
    const fade=Math.pow(1-p.age/p.life,.85),size={S:.8,M:1.05,L:1.2}[s.settings.size],dot=p.size*size*(.78+fade*.22)/6;ctx.fillStyle='#ffffff';ctx.globalAlpha=fade*.22;ctx.beginPath();ctx.arc(p.x,p.y,dot*1.35,0,Math.PI*2);ctx.fill();ctx.globalAlpha=fade*.96;ctx.beginPath();ctx.arc(p.x,p.y,dot*.5,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.shadowColor='transparent';ctx.globalCompositeOperation='source-over';
}
function drawThermalCursor(ctx,s,time){
  const m=s.mouse;if(!m.seen)return;const x=m.heatX,y=m.heatY,size={S:.7,M:.82,L:.95}[s.settings.size]/6;ctx.fillStyle='#ffffff';ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,size*.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
}
function drawDirection(ctx,s,time){
  if(!s.sonars.length)return;const wave=s.sonars[s.sonars.length-1];if(wave.age>1.35)return;const m=s.mouse,p=s.prey,angle=Math.atan2(p.y*s.height-m.y,p.x*s.width-m.x),r=43+Math.sin(time*4)*2,x=m.x+Math.cos(angle)*r,y=m.y+Math.sin(angle)*r;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-3);ctx.lineTo(-2,0);ctx.lineTo(-4,3);ctx.closePath();ctx.fillStyle=`rgba(255,158,44,${.35*(1-wave.age/1.35)})`;ctx.fill();ctx.restore();
}
function drawExperience(now){
  const s=experienceState;if(!s.running)return;const ctx=experienceContext,dt=Math.min(.04,Math.max(.001,(now-(s.lastTime||now))*.001));s.lastTime=now;
  ctx.fillStyle='#060911';ctx.fillRect(0,0,s.width,s.height);const time=now*.001;
  const ground=ctx.createLinearGradient(0,s.height*.52,0,s.height);ground.addColorStop(0,'rgba(16,28,45,0)');ground.addColorStop(1,'rgba(17,30,48,.32)');ctx.fillStyle=ground;ctx.fillRect(0,s.height*.48,s.width,s.height*.52);
  if(s.thermalContext){const residue=s.thermalContext;residue.save();residue.setTransform(1,0,0,1,0,0);residue.globalCompositeOperation='source-over';residue.globalAlpha=1;residue.fillStyle=`rgba(6,9,17,${clamp(dt/.35,.002,.12)})`;residue.fillRect(0,0,s.thermalCanvas.width,s.thermalCanvas.height);residue.restore();residue.setTransform(s.dpr*.68,0,0,s.dpr*.68,0,0);residue.globalCompositeOperation='lighter';drawTrail(residue,s,dt);ctx.drawImage(s.thermalCanvas,0,0,s.width,s.height);}
  if(s.mouse.seen){const ease=1-Math.exp(-dt*28);s.mouse.heatX+=(s.mouse.x-s.mouse.heatX)*ease;s.mouse.heatY+=(s.mouse.y-s.mouse.heatY)*ease;}
  drawAmbient(ctx,s,dt,time);drawRocks(ctx,s,time);
  for(let i=s.sonars.length-1;i>=0;i--){s.sonars[i].age+=dt;if(s.sonars[i].age>=s.sonars[i].duration)s.sonars.splice(i,1);}
  drawSonars(ctx,s);drawPrey(ctx,s,dt,time);drawThermalCursor(ctx,s,time);drawDirection(ctx,s,time);
  if(!s.ended||s.trail.length||now<s.residueUntil)s.frame=requestAnimationFrame(drawExperience);
}
startButton.addEventListener('click',startExperience);
settingsToggle.addEventListener('click',()=>{const open=settingsPanel.hidden;settingsPanel.hidden=!open;settingsToggle.setAttribute('aria-expanded',String(open));});
soundToggle.addEventListener('click',()=>{experienceState.settings.sound=!experienceState.settings.sound;soundToggle.setAttribute('aria-pressed',String(experienceState.settings.sound));});
resetButton.addEventListener('click',resetExperience);
settingsPanel.addEventListener('click',event=>{
  const button=event.target.closest('button[data-setting]');if(!button)return;
  const {setting,value}=button.dataset;settingsPanel.querySelectorAll(`button[data-setting="${setting}"]`).forEach(option=>option.setAttribute('aria-pressed',String(option===button)));
  applySetting(setting,value);
});
experienceCanvas.addEventListener('pointermove',pointerMove,{passive:true});
experienceCanvas.addEventListener('pointerdown',event=>{experienceCanvas.setPointerCapture?.(event.pointerId);triggerSonar(event.clientX,event.clientY);},{passive:true});
experienceCanvas.addEventListener('pointerleave',()=>{experienceState.mouse.speed=0;},{passive:true});
strikeButton.addEventListener('click',event=>{event.stopPropagation();strike();});
senseAgainButton.addEventListener('click',senseAgain);
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'){settingsPanel.hidden=true;settingsToggle.setAttribute('aria-expanded','false');return;}
  if(event.code==='Space'&&experience.classList.contains('is-active')&&!experienceState.ended&&!event.target.closest('button')){event.preventDefault();triggerSonar();}
},{passive:false});
window.addEventListener('resize',()=>{if(experienceState.started)resizeExperience();},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!experienceState.started)return;if(document.hidden){cancelAnimationFrame(experienceState.frame);experienceState.running=false;}else if(!experienceState.ended){experienceState.running=true;experienceState.lastTime=performance.now();experienceState.frame=requestAnimationFrame(drawExperience);}},{passive:true});
