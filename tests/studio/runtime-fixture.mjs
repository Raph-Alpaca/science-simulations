import {hash} from '../../packages/contracts/content-source.js';
import {parseCandidate} from '../../automation/runner/candidate.mjs';
import {prepareRuntimeBundle} from '../../automation/runner/runtime-contract.mjs';

// Reviewed synthetic browser programs only. These are not curriculum content.
const meta={schemaVersion:1,id:'runtime-shapes',title:'검사용 도형',grade:3,unit:'검사용 모형',summary:'Synthetic runtime fixture only.',concepts:['동작 검사'],schoolYear:null,curriculumRevision:null,entry:'index.html',sourceIds:['fixture-only'],stage:'draft',assumptions:['교육과정 내용이 아닌 실행 검사 전용 모형입니다.'],approvalIsExternal:true};
const context={contentId:meta.id,grade:meta.grade,unit:meta.unit,schoolYear:meta.schoolYear,curriculumRevision:meta.curriculumRevision,
 config:{units:[{grade:3,label:'검사용 모형'}]},sources:meta.sourceIds.map(id=>({id}))};
export function runtimeFixture({kind='interactive_2d',html='',js='',brokenReset=false,staticView=false,files=[]}={}){
 const threeD=kind==='interactive_3d';
 const page=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>검사용 도형</title><link rel="stylesheet" href="style.css"><script src="ui.js" defer></script></head><body><main><h1>검사용 도형</h1><label for="amount">도형 크기</label><input id="amount" data-sim-control type="range" min="1" max="4" step="1" value="1"><output data-sim-output></output><canvas data-sim-view width="320" height="240" aria-label="조작 가능한 도형"></canvas><button data-sim-reset>초기화</button><p data-sim-assumptions>동작 검사만을 위한 단순한 모형이며 과학 수업 자료가 아닙니다.</p>${threeD?'<label for="angle">카메라 각도</label><input id="angle" data-sim-camera type="range" min="0" max="80" value="20"><button data-sim-fallback>설명 보기</button><p data-sim-alternative hidden>입체 도형의 크기와 회전을 설명하는 대체 텍스트입니다.</p>':''}${html}</main></body></html>`;
 const common=`const control=document.querySelector('[data-sim-control]'),output=document.querySelector('[data-sim-output]'),canvas=document.querySelector('canvas');`;
 const two=`const ctx=canvas.getContext('2d');function draw(){output.textContent='크기 '+control.value;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,320,240);ctx.fillStyle='#005599';ctx.fillRect(20,30,${staticView?'30':'30*Number(control.value)'},100);}control.addEventListener('input',draw);document.querySelector('[data-sim-reset]').addEventListener('click',()=>{${brokenReset?'':'control.value=1;draw();'}});draw();`;
 const cube=`
const camera=document.querySelector('[data-sim-camera]'),alternative=document.querySelector('[data-sim-alternative]');
document.querySelector('[data-sim-fallback]').addEventListener('click',()=>{alternative.hidden=false;});
const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true});
if(!gl){alternative.hidden=false;output.textContent='WebGL 없음';}
else{
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('SHADER');return s;};
 const program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 p;uniform float angle;uniform float size;varying vec3 color;void main(){float a=angle*0.0174532925;vec3 v=p*size;vec3 r=vec3(v.x*cos(a)-v.z*sin(a),v.y,v.x*sin(a)+v.z*cos(a));gl_Position=vec4(r.x*0.75,r.y,r.z*0.2,3.0+r.z);color=p*0.3+0.6;}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 color;void main(){gl_FragColor=vec4(color,1.0);}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('PROGRAM');gl.useProgram(program);
 const vertices=new Float32Array([-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1]);
 const indices=new Uint16Array([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]);
 gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);const location=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);gl.enable(gl.DEPTH_TEST);
 function draw(){output.textContent='크기 '+control.value;gl.viewport(0,0,320,240);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(gl.getUniformLocation(program,'size'),0.35+Number(control.value)*0.1);gl.uniform1f(gl.getUniformLocation(program,'angle'),Number(camera.value));gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);}
 control.addEventListener('input',draw);camera.addEventListener('input',draw);document.querySelector('[data-sim-reset]').addEventListener('click',()=>{control.value=1;camera.value=20;draw();});draw();
}`;
 const list=[{path:'meta.json',content:JSON.stringify(meta)},{path:'index.html',content:page},{path:'style.css',content:'body{margin:16px;font:16px sans-serif;color:#17202a;background:#fff}main{max-width:720px}canvas{display:block;max-width:100%;height:auto}button,input{margin:10px}output{display:block}p{line-height:1.5}'},{path:'ui.js',content:common+(threeD?cube:two)+js},...files];
 const inputText=JSON.stringify({input:{generationKind:kind,requirements:[{id:'R1',text:'Synthetic fixture only.'}]},context});
 const candidateText=JSON.stringify({files:list}),candidate=parseCandidate(candidateText,context);
 const expected={candidateHash:candidate.candidateHash,sourceSnapshotHash:hash(inputText),baselineSha:'a'.repeat(40),attempt:0};
 return {inputText,candidateText,expected,bundle:prepareRuntimeBundle({inputText,candidateText,expected})};
}
