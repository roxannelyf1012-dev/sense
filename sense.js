const canvas = document.querySelector('#sense-field');
const video = document.querySelector('#camera-video');
const cameraStop = document.querySelector('#camera-stop');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const ui = {
  title: document.querySelector('#state-title'), index: document.querySelector('#state-index'), copy: document.querySelector('#state-copy'),
  note: document.querySelector('#note-copy'), cue: document.querySelector('#interaction-cue'), stage: document.querySelector('#stage-label'),
  status: document.querySelector('#status'), camera: document.querySelector('#camera-toggle'), cameraLabel: document.querySelector('#camera-label'),
};
const state = {
  w: 0, h: 0, dpr: 1, mode: 'infrared', intro: 'head', introAt: performance.now(), time: 0, last: 0, raf: 0,
  pointer: { x: .72, y: .54, down: false, active: false }, particles: [], pulses: [], intensity: 1,
  yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, lastScentMorph: 0, lastMovePulse: 0,
  stream: null, tracker: null, tracking: false, loading: false, trackRaf: 0, lastVideo: -1, lastTrack: 0, candidate: '', candidateAt: 0, gesture: '',
};
const COLOR_RGB = [[.94,.96,1], [1,.12,.22], [.2,.43,1]];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// WebGL point sprites give every particle real camera perspective and depth.
const gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
if (!gl) {
  ui.status.hidden = false;
  ui.status.textContent = 'This browser could not start WebGL. Please use a current version of Chrome, Edge, Safari, or Firefox.';
} else {
  const vertexSource = `
    precision highp float;
    attribute vec3 aPosition;
    attribute vec3 aColor;
    attribute float aSize;
    attribute float aPhase;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uYaw;
    uniform float uPitch;
    uniform float uPointScale;
    varying vec3 vColor;
    varying float vFade;
    varying float vPhase;
    void main() {
      vec3 p = aPosition;
      p.x += sin(uTime * .35 + aPhase) * .003;
      p.y += cos(uTime * .28 + aPhase * 1.7) * .003;
      float cy = cos(uYaw), sy = sin(uYaw);
      p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
      float cx = cos(uPitch), sx = sin(uPitch);
      p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
      float depth = max(1.35, 3.55 - p.z);
      float aspect = uResolution.x / uResolution.y;
      float focal = 2.12;
      float zNear = .1, zFar = 30.0;
      float viewZ = -depth;
      float clipZ = ((zFar + zNear) / (zNear - zFar)) * viewZ + (2.0 * zFar * zNear) / (zNear - zFar);
      gl_Position = vec4(p.x * focal / aspect, p.y * focal, clipZ, depth);
      gl_PointSize = clamp(aSize * uPointScale * uResolution.y / (depth * 125.0), 1.0, 9.0);
      vColor = aColor;
      vFade = clamp(1.22 - depth * .105, .48, 1.0);
      vPhase = aPhase;
    }`;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    varying float vFade;
    varying float vPhase;
    uniform float uTime;
    void main() {
      vec2 q = gl_PointCoord - vec2(.5);
      float r = length(q);
      float core = 1.0 - smoothstep(.12, .5, r);
      float halo = exp(-r * 8.5) * .34;
      float pulse = .88 + .12 * sin(uTime * 1.7 + vPhase);
      float alpha = (core + halo) * vFade * pulse;
      gl_FragColor = vec4(vColor, alpha);
    }`;
  function shader(type, source) {
    const item = gl.createShader(type); gl.shaderSource(item, source); gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item) || 'WebGL shader failed.');
    return item;
  }
  let program;
  try {
    program = gl.createProgram(); gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL program failed.');
  } catch (error) {
    ui.status.hidden = false; ui.status.textContent = `3D particle engine failed to start: ${error.message}`;
  }

  if (program) {
    gl.useProgram(program);
    const locations = {
      position: gl.getAttribLocation(program, 'aPosition'), color: gl.getAttribLocation(program, 'aColor'),
      size: gl.getAttribLocation(program, 'aSize'), phase: gl.getAttribLocation(program, 'aPhase'),
      resolution: gl.getUniformLocation(program, 'uResolution'), time: gl.getUniformLocation(program, 'uTime'),
      yaw: gl.getUniformLocation(program, 'uYaw'), pitch: gl.getUniformLocation(program, 'uPitch'), pointScale: gl.getUniformLocation(program, 'uPointScale'),
    };
    const buffers = { position: gl.createBuffer(), color: gl.createBuffer(), size: gl.createBuffer(), phase: gl.createBuffer() };
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.disable(gl.DEPTH_TEST);

    function addLine3(a, b, count, color = 0, spread = .012, out = []) {
      for (let i = 0; i < count; i++) { const t = Math.random(), n = rand(-spread, spread); out.push({ x: a.x + (b.x - a.x) * t + n, y: a.y + (b.y - a.y) * t - n, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t + rand(-spread, spread), c: color }); }
    }
    function addCurve3(fn, count, color = 0, spread = .008, out = []) {
      for (let i = 0; i < count; i++) { const t = Math.random(), p = fn(t), n = rand(-spread, spread); out.push({ x: p.x + n, y: p.y - n, z: (p.z || 0) + rand(-spread, spread), c: color }); }
    }
    function addEllipse3(cx, cy, rx, ry, count, color = 0, fill = false, out = [], z = 0, depth = .025, a0 = 0, a1 = Math.PI * 2) {
      for (let i = 0; i < count; i++) { const a = rand(a0, a1), r = fill ? Math.sqrt(Math.random()) : 1 + rand(-.018, .018); out.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r, z: z + Math.cos(a * 2) * depth * (fill ? r : 1) + rand(-.008,.008), c: color }); }
    }
    function addHead(out, density = 1, tongue = false, offsetX = 0, offsetY = 0, size = 1) {
      const pt = (x,y,z=0) => ({x:offsetX+x*size,y:offsetY+y*size,z});
      const outline = [[-.92,0,-.12],[-.78,.42,-.08],[-.4,.68,-.03],[.08,.62,.06],[.42,.38,.18],[.66,.1,.28],[.72,0,.3],[.55,-.12,.22],[.26,-.4,.12],[-.2,-.62,0],[-.62,-.46,-.06],[-.92,0,-.12]].map(p=>pt(...p));
      for (let i=0;i<outline.length-1;i++) addLine3(outline[i],outline[i+1],Math.round(125*density),0,.008,out);
      // Raised overlapping scale rows follow a volumetric skull rather than a flat polygon.
      for(let row=0;row<10;row++){
        const v=row/9, y=-.48+v*.98, taper=Math.abs(v-.52)*.4, left=-.75+taper, right=.42-taper*.8;
        for(let x=left;x<right;x+=.067){
          const z=.06+Math.max(0,1-Math.abs(x+.18))*Math.max(0,1-Math.abs(y)*1.2)*.25;
          addEllipse3(offsetX+x*size,offsetY+y*size,.028*size,.035*size,Math.max(6,Math.round(11*density)),0,false,out,z,.012*size);
          if((row+Math.round((x+1)*20))%3===0) addEllipse3(offsetX+x*size,offsetY+y*size,.014*size,.018*size,3,0,true,out,z+.012,.006);
        }
      }
      // Eye socket: layered orbital rim, blue-white iris, red vertical slit.
      const eyeX=offsetX+.12*size, eyeY=offsetY+.31*size, ez=.32;
      addEllipse3(eyeX,eyeY,.16*size,.105*size,210*density,0,false,out,ez,.04*size);
      addEllipse3(eyeX,eyeY,.12*size,.076*size,170*density,2,false,out,ez+.025,.03*size);
      addEllipse3(eyeX,eyeY,.028*size,.067*size,100*density,1,true,out,ez+.05,.01*size);
      addEllipse3(eyeX-.01*size,eyeY+.002*size,.006*size,.045*size,26,0,true,out,ez+.06,.004);
      // Loreal pit between eye and snout; clearly separate from the nostril.
      const pitX=offsetX+.51*size,pitY=offsetY+.045*size,pz=.37;
      addEllipse3(pitX,pitY,.061*size,.052*size,105*density,2,false,out,pz,.025*size);
      addEllipse3(pitX,pitY,.038*size,.031*size,50*density,1,false,out,pz+.012,.015*size);
      addEllipse3(offsetX+.66*size,offsetY+.12*size,.018*size,.012*size,24,0,false,out,.36,.008);
      // Mouth and jaw crease.
      addCurve3(t=>({x:offsetX+(-.7+t*1.28)*size,y:offsetY+(-.27-.12*Math.sin(t*Math.PI))*size,z:.12+Math.sin(t*Math.PI)*.08}),210,0,.006,out);
      if(tongue){
        const root={x:offsetX+.67*size,y:offsetY-.11*size,z:.34}, fork={x:offsetX+.92*size,y:offsetY-.11*size,z:.48};
        addCurve3(t=>({x:root.x+(fork.x-root.x)*t,y:root.y+.01*Math.sin(t*Math.PI),z:root.z+(fork.z-root.z)*t}),200,1,.006,out);
        addCurve3(t=>({x:fork.x+.48*size*t,y:fork.y+.31*size*t,z:fork.z+.08*Math.sin(t*Math.PI)}),220,2,.008,out);
        addCurve3(t=>({x:fork.x+.5*size*t,y:fork.y-.31*size*t,z:fork.z+.08*Math.sin(t*Math.PI)}),220,2,.008,out);
      }
    }
    function createTargets(mode) {
      const out=[];
      if(mode==='head') addHead(out,1.5,false,-.06,.02,1.12);
      else if(mode==='scales'){
        // Close-up scale mantle is a curved 3D surface, not a flat tiled image.
        for(let row=0;row<19;row++){
          const y=-.96+row*.105;
          for(let col=0;col<29;col++){
            const x=-1.42+col*.102+(row%2)*.051;if(x>1.48)continue;
            const z=.42-.23*x*x-.34*y*y+.025*Math.sin(col*.6+row*.3);
            addEllipse3(x,y,.055,.067,22,row%7===0?2:0,false,out,z,.035);
            if((row+col)%3===0)addEllipse3(x,y,.028,.034,5,0,true,out,z+.01,.018);
          }
        }
      } else if(mode==='eye') addHead(out,1.85,true,-.14,.0,1.24);
      else if(mode==='infrared'){
        // White/blue cold environment layers recede in depth; a warm animal and its heat envelope glow red.
        for(let layer=0;layer<11;layer++){
          const z=-.9+layer*.17, amp=.08+layer*.009;
          addCurve3(t=>({x:-1.8+t*3.6,y:-.72+layer*.085+Math.sin(t*8+layer*.6)*amp,z}),145,layer%4===0?2:0,.009,out);
        }
        for(let i=0;i<600;i++)out.push({x:rand(-1.9,1.9),y:rand(-.9,.9),z:rand(-1.1,.8),c:Math.random()<.18?2:0});
        const x=.83,y=-.12,z=.18;
        addEllipse3(x,y,.24,.12,360,1,true,out,z,.07);
        addEllipse3(x+.2,y+.08,.1,.1,160,1,true,out,z+.04,.06);
        addEllipse3(x+.16,y+.17,.045,.095,85,1,false,out,z+.08,.04,Math.PI,Math.PI*2);
        addEllipse3(x+.27,y+.1,.012,.012,20,0,true,out,z+.11,.005);
        addCurve3(t=>({x:x-.19-.29*t,y:y+.015+Math.sin(t*5)*.045,z:z+.08*t}),140,1,.01,out);
        addLine3({x:.64,y:-.2,z:.2},{x:.59,y:-.39,z:.24},60,1,.012,out);
        addLine3({x:.91,y:-.2,z:.24},{x:.98,y:-.38,z:.28},60,1,.012,out);
        for(let ring=0;ring<5;ring++)addEllipse3(x,y,.29+ring*.105,.16+ring*.062,145,ring%2?1:2,false,out,z-ring*.025,.012);
      } else if(mode==='chemical'){
        addHead(out,1.05,true,-.16,.0,1.05);
        const c=state.pointer, ex=clamp((c.x-.5)*3.1,-.1,1.35), ey=clamp((.5-c.y)*1.75,-.68,.68);
        for(const side of [-1,1]){
          const end={x:ex+1.0,y:ey+side*.15,z:.12+side*.18},start={x:.73,y:-.12,z:.45};
          addCurve3(t=>({x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t+side*Math.sin(t*Math.PI)*.14,z:start.z+(end.z-start.z)*t+Math.sin(t*Math.PI)*.22}),660,2,.018,out);
          addCurve3(t=>({x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t+side*Math.sin(t*Math.PI)*.14,z:start.z+(end.z-start.z)*t+Math.sin(t*Math.PI)*.22}),145,0,.035,out);
        }
        for(let i=0;i<210;i++)out.push({x:rand(-1.8,1.8),y:rand(-.8,.8),z:rand(-.7,.9),c:2});
      } else if(mode==='vibration'){
        // Ground is a volumetric perspective plane. Click and movement create propagating 3D rings.
        for(let row=0;row<27;row++){
          const z=-1.15+row*.095,y=-.62+row*.026;
          addCurve3(t=>({x:-2.05+t*4.1,y:y+Math.sin(t*9+row*.38)*.018,z:z+Math.sin(t*5+row)*.025}),150,row%5===0?2:0,.006,out);
        }
        addCurve3(t=>({x:-1.55+t*1.25,y:-.43+Math.sin(t*Math.PI*1.6)*.14,z:.35+Math.sin(t*Math.PI)*.25}),560,0,.012,out);
        addEllipse3(-1.48,-.4,.17,.12,210,0,false,out,.39,.06);
        addEllipse3(-1.5,-.4,.025,.085,38,1,true,out,.46,.02);
        const c=state.pointer, cx=(c.x-.5)*4.0, cy=(.5-c.y)*1.8;
        for(let ring=0;ring<9;ring++)addEllipse3(cx,cy,.08+ring*.14,.035+ring*.08,155,ring%2?2:1,false,out,.4-ring*.12,.012,Math.PI*1.05,Math.PI*1.95);
      } else if(mode==='spatial'){
        // A navigable cloud of depth planes, distant objects, and a sinuous snake body.
        for(let layer=0;layer<18;layer++){
          const z=-1.15+layer*.135, spread=.018+layer*.001;
          addCurve3(t=>({x:-2.0+t*4.0,y:-.62+layer*.073+Math.sin(t*7+layer*.4)*(.035+layer*.002),z}),120+layer*3,layer%4===0?2:0,spread,out);
        }
        addCurve3(t=>({x:-1.25+t*2.05,y:-.2+Math.sin(t*8)*.27,z:.24+Math.cos(t*5)*.19}),630,0,.014,out);
        for(const [x,y,z,r,n] of [[-1.48,.38,-.3,.19,280],[1.2,.24,-.8,.14,180],[1.35,-.48,.48,.25,340],[.05,.71,-1,.1,110]]){
          for(let i=0;i<n;i++){const a=rand(0,Math.PI*2),rr=Math.sqrt(Math.random());out.push({x:x+Math.cos(a)*r*rr,y:y+Math.sin(a)*r*.65*rr,z:z+rand(-.08,.08),c:Math.random()<.1?1:0});}
        }
        addHead(out,.75,false,-.68,-.03,.65);
      }
      if(!out.length)addHead(out,1,false);
      return out;
    }
    function morph() {
      const targets=createTargets(state.intro||state.mode);
      for(let i=0;i<state.particles.length;i++){
        const t=targets[(i*37)%targets.length],p=state.particles[i];
        p.tx=t.x;p.ty=t.y;p.tz=t.z||0;p.tc=COLOR_RGB[t.c]||COLOR_RGB[0];
      }
    }
    function resize(){
      state.w=innerWidth;state.h=innerHeight;state.dpr=Math.min(devicePixelRatio||1,innerWidth<700?1.4:1.8);
      canvas.width=Math.round(state.w*state.dpr);canvas.height=Math.round(state.h*state.dpr);gl.viewport(0,0,canvas.width,canvas.height);
      const count=Math.min(innerWidth<700?4400:8200,Math.max(innerWidth<700?2800:4200,Math.floor(state.w*state.h/(innerWidth<700?210:165))));
      state.particles=Array.from({length:count},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,tx:0,ty:0,tz:0,c:[1,1,1],tc:[1,1,1],phase:rand(0,6.28),size:Math.random()<.94?rand(.85,1.7):rand(1.8,2.6)}));
      morph();for(const p of state.particles){p.x=p.tx+rand(-.015,.015);p.y=p.ty+rand(-.015,.015);p.z=p.tz+rand(-.035,.035);}
    }
    function addPulse(x,y,power=1){state.pulses.push({x,y,at:performance.now(),power});if(state.pulses.length>6)state.pulses.shift();}
    function render(now){
      const dt=Math.min(.04,Math.max(.008,(now-(state.last||now))*.001));state.last=now;state.time+=dt;
      if(state.intro&&!reduced.matches){const age=now-state.introAt;if(state.intro==='head'&&age>1800){state.intro='scales';morph();ui.index.textContent='PROLOGUE / SCALES';ui.title.innerHTML='A living<br>surface.';ui.copy.textContent='Thousands of points rise into overlapping scales.';}else if(state.intro==='scales'&&age>4100){state.intro='eye';morph();ui.index.textContent='PROLOGUE / EYE + PIT';ui.title.innerHTML='Feel the<br>invisible.';ui.copy.textContent='A vertical pupil and paired heat pits emerge from the scale field.';}else if(state.intro==='eye'&&age>6900){state.intro='';setMode(state.mode);}}
      const pointX=(state.pointer.x-.5)*3.45,pointY=(.5-state.pointer.y)*1.92;
      state.targetYaw=(state.pointer.x-.5)*.58;state.targetPitch=(.5-state.pointer.y)*.42;
      state.yaw+=(state.targetYaw-state.yaw)*.045;state.pitch+=(state.targetPitch-state.pitch)*.045;
      const positions=new Float32Array(state.particles.length*3),colors=new Float32Array(state.particles.length*3),sizes=new Float32Array(state.particles.length),phases=new Float32Array(state.particles.length);
      gl.clearColor(.015,.018,.024,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
      for(let i=0;i<state.particles.length;i++){
        const p=state.particles[i];let ax=(p.tx-p.x)*16+Math.sin(state.time*.6+p.phase)*.004,ay=(p.ty-p.y)*16+Math.cos(state.time*.55+p.phase)*.004,az=(p.tz-p.z)*13+Math.sin(state.time*.38+p.phase)*.003;
        const dx=p.x-pointX,dy=p.y-pointY,dz=p.z-.25,d2=dx*dx+dy*dy+dz*dz;
        const radius=state.mode==='infrared'?.42:.31,near=state.pointer.active?Math.max(0,1-Math.sqrt(d2)/radius):0;
        if(near>.001&&d2>.00001){const force=(state.mode==='infrared'?.62:.2)*near,inv=1/Math.sqrt(d2);ax+=dx*inv*force;ay+=dy*inv*force;az+=dz*inv*force;}
        if(state.mode==='vibration')for(const pulse of state.pulses){const age=(now-pulse.at)/1000,dist=Math.sqrt((p.x-pulse.x)*(p.x-pulse.x)+(p.y-pulse.y)*(p.y-pulse.y)+(p.z+.1)*(p.z+.1)),radius=age*(.48+pulse.power*.42),wave=Math.exp(-Math.pow((dist-radius)/.09,2))*Math.max(0,1-age/4)*pulse.power;const inv=1/(dist+.04);ax+=(p.x-pulse.x)*inv*wave*1.1;ay+=(p.y-pulse.y)*inv*wave*1.1;az+=(p.z+.1)*inv*wave*.8;}
        p.vx=(p.vx+ax*dt)*.86;p.vy=(p.vy+ay*dt)*.86;p.vz=(p.vz+az*dt)*.86;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
        const blend=Math.min(1,dt*4);p.c[0]+=(p.tc[0]-p.c[0])*blend;p.c[1]+=(p.tc[1]-p.c[1])*blend;p.c[2]+=(p.tc[2]-p.c[2])*blend;
        const heat=state.mode==='infrared'&&p.tc[0]>.9&&p.tc[1]<.3?near:0;
        positions[i*3]=p.x;positions[i*3+1]=p.y;positions[i*3+2]=p.z;
        colors[i*3]=Math.min(1,p.c[0]+heat*.5);colors[i*3+1]=Math.min(1,p.c[1]+heat*.22);colors[i*3+2]=Math.min(1,p.c[2]+near*.1);
        sizes[i]=p.size*(1+near*1.6+heat*1.8);phases[i]=p.phase;
      }
      const bind=(buffer,data,location,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
      bind(buffers.position,positions,locations.position,3);bind(buffers.color,colors,locations.color,3);bind(buffers.size,sizes,locations.size,1);bind(buffers.phase,phases,locations.phase,1);
      gl.uniform2f(locations.resolution,canvas.width,canvas.height);gl.uniform1f(locations.time,state.time);gl.uniform1f(locations.yaw,state.yaw);gl.uniform1f(locations.pitch,state.pitch);gl.uniform1f(locations.pointScale,state.dpr>1.4?1.15:1.3);
      gl.drawArrays(gl.POINTS,0,state.particles.length);state.pulses=state.pulses.filter(p=>now-p.at<4200);state.raf=requestAnimationFrame(render);
    }
    function setMode(mode){
      state.mode=mode;state.intro='';document.querySelectorAll('.sense-button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
      const data={
        infrared:['01 / INFRARED','Warmth<br>in the dark.','Move through depth to reveal a living heat signature.','Pit organs detect infrared radiation from warm animals. Red particles mark thermal cues in this interpreted 3D field.','MOVE IN 3D TO DISTURB THE WARM SIGNAL','3D HEAT FIELD / PREY SIGNATURE'],
        chemical:['02 / CHEMICAL','Two samples.<br>One trail.','Move your pointer to steer the paired scent streams.','A forked tongue collects chemical samples at two tips. The two blue trajectories meet at the vomeronasal organ.','MOVE TO STEER THE FORKED TRAILS','3D CHEMICAL FIELD / DUAL TRAIL'],
        vibration:['03 / VIBRATION','Movement<br>through ground.','Move or tap anywhere to send a 3D ground pulse.','Substrate vibration travels through the body and lower jaw apparatus. Particle waves travel in depth toward the snake.','MOVE OR TAP TO SEND 3D RIPPLE WAVES','3D GROUND / MECHANICAL SIGNAL'],
        spatial:['04 / SPATIAL','A world made<br>of many cues.','Move to orbit and explore the shared space.','Thermal, chemical and mechanical cues contribute to awareness of nearby objects, direction, distance and movement.','DRAG POINTER TO ORBIT THE PARTICLE SPACE','3D ENVIRONMENT / DEPTH CUES'],
      }[mode];
      ui.index.textContent=data[0];ui.title.innerHTML=data[1];ui.copy.textContent=data[2];ui.note.textContent=data[3];ui.cue.textContent=data[4];ui.stage.textContent=data[5];morph();
    }
    function pointerFromEvent(e){state.pointer.x=clamp(e.clientX/state.w,0,1);state.pointer.y=clamp(e.clientY/state.h,0,1);state.pointer.active=true;}
    canvas.addEventListener('pointermove',e=>{pointerFromEvent(e);const now=performance.now();if(state.mode==='chemical'&&now-state.lastScentMorph>260){state.lastScentMorph=now;morph();}if(state.mode==='vibration'&&now-state.lastMovePulse>320){state.lastMovePulse=now;addPulse((state.pointer.x-.5)*3.45,(.5-state.pointer.y)*1.92,1);}});
    canvas.addEventListener('pointerdown',e=>{pointerFromEvent(e);state.pointer.down=true;if(state.mode==='vibration')addPulse((state.pointer.x-.5)*3.45,(.5-state.pointer.y)*1.92,1.25);});
    canvas.addEventListener('pointerup',()=>state.pointer.down=false);canvas.addEventListener('pointerleave',()=>{state.pointer.active=false;state.pointer.down=false;});
    document.querySelectorAll('.sense-button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    document.querySelector('#note-toggle').addEventListener('click',e=>{const b=e.currentTarget,panel=document.querySelector('#field-note'),open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));panel.hidden=!open;document.querySelector('#note-icon').textContent=open?'−':'+';});
    document.addEventListener('keydown',e=>{const modes=['infrared','chemical','vibration','spatial'];if(e.key>='1'&&e.key<='4')setMode(modes[Number(e.key)-1]);});
    window.addEventListener('resize',resize,{passive:true});resize();

    function showStatus(message){ui.status.hidden=!message;ui.status.textContent=message;}
    function classify(points){const raised=(tip,joint)=>points[tip].y<points[joint].y-.015,index=raised(8,6),middle=raised(12,10),ring=raised(16,14),pinky=raised(20,18),pinch=Math.hypot(points[4].x-points[8].x,points[4].y-points[8].y)<.065,count=[index,middle,ring,pinky].filter(Boolean).length;if(pinch)return'infrared';if(index&&middle&&!ring&&!pinky)return'chemical';if(count===0)return'vibration';if(count>=4)return'spatial';return state.mode;}
    function handFrame(now){if(!state.tracking||!state.tracker)return;if(video.readyState>=2&&video.currentTime!==state.lastVideo&&now-state.lastTrack>140){state.lastVideo=video.currentTime;state.lastTrack=now;try{const r=state.tracker.detectForVideo(video,now),points=r.landmarks?.[0];if(points){const mode=classify(points),p=points[9];state.pointer.x=clamp(.28+(1-p.x)*.68,.02,.98);state.pointer.y=clamp(.1+p.y*.8,.02,.98);state.pointer.active=true;if(mode!==state.candidate){state.candidate=mode;state.candidateAt=now;}if(now-state.candidateAt>170&&mode!==state.gesture){state.gesture=mode;setMode(mode);}}}catch(error){console.warn('Hand tracking frame failed',error);}}state.trackRaf=requestAnimationFrame(handFrame);}
    async function stopCamera(show=true){state.tracking=false;if(state.trackRaf)cancelAnimationFrame(state.trackRaf);state.trackRaf=0;if(state.tracker){try{state.tracker.close();}catch{}state.tracker=null;}state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;video.srcObject=null;video.hidden=true;video.classList.remove('live');ui.camera.classList.remove('active');ui.cameraLabel.textContent='HAND TRACKING';cameraStop.hidden=true;if(show)showStatus('');}
    async function startCamera(){if(state.loading)return;state.loading=true;ui.camera.disabled=true;cameraStop.hidden=true;ui.cameraLabel.textContent='CONNECTING…';showStatus('Allow camera access in your browser.');try{if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Camera needs HTTPS and must be opened directly in your browser.');if(!state.stream){try{state.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:480},height:{ideal:360}}});}catch(error){if(!['OverconstrainedError','ConstraintNotSatisfiedError'].includes(error.name))throw error;state.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});}video.srcObject=state.stream;await video.play();video.hidden=false;video.classList.add('live');}showStatus('Camera connected. Loading hand tracking…');const vision=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs');const fs=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm');const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minTrackingConfidence:.5};try{state.tracker=await vision.HandLandmarker.createFromOptions(fs,options);}catch{options.baseOptions.delegate='CPU';state.tracker=await vision.HandLandmarker.createFromOptions(fs,options);}state.tracking=true;ui.camera.classList.add('active');ui.cameraLabel.textContent='CAMERA ON';showStatus('Open palm: spatial · pinch: infrared · two fingers: chemical · fist: vibration.');state.trackRaf=requestAnimationFrame(handFrame);}catch(error){if(!state.stream){await stopCamera(false);ui.cameraLabel.textContent='RETRY CAMERA';const advice={NotAllowedError:'Allow camera permission in your browser site settings.',NotFoundError:'No camera found.',NotReadableError:'Camera is busy in another app.',SecurityError:'Open this HTTPS page directly, then allow camera access.'};showStatus(`${advice[error.name]||error.message||'Camera could not start.'}${error.name?` (${error.name})`:''}`);}else{ui.camera.classList.add('active');ui.cameraLabel.textContent='RETRY TRACKER';cameraStop.hidden=false;showStatus(`Camera is on, but the hand tracker could not load. ${error.message||''}`);}}finally{state.loading=false;ui.camera.disabled=false;}}
    ui.camera.addEventListener('click',()=>{if(state.loading)return;if(state.tracking)stopCamera();else startCamera();});cameraStop.addEventListener('click',()=>stopCamera());
    document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;if(state.trackRaf)cancelAnimationFrame(state.trackRaf);state.trackRaf=0;}else{if(!state.raf)state.raf=requestAnimationFrame(render);if(state.tracking)state.trackRaf=requestAnimationFrame(handFrame);}});
    state.raf=requestAnimationFrame(render);
  }
}
