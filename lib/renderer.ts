// WebGL2 parametric renderer. Source texture is never modified; every frame re-renders from params.
import { EditParams, HSL_CENTERS, buildCurveLUT } from "./params";
import { LocalLayer, MAX_LOCALS } from "./masks";

const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform sampler2D uCurve; uniform highp sampler3D uLut; uniform float uLutAmt,uLutN;
uniform vec2 uSrcSize, uOutSize, uCropCenter; uniform float uAngle, uZoom;
uniform float uDehaze,uBloom,uHal,uDist,uCA,uPV,uPH,uAir;
uniform float uGSh,uGHi,uGSS,uGHS,uGBal;
uniform sampler2D uMip; uniform float uGauss,uBox,uMos,uMotion,uTilt,uBokeh,uSoft,uFade; uniform vec4 uFocus;
uniform float uExp,uCon,uHi,uSh,uWh,uBl,uTemp,uTint,uVib,uSat,uTex,uCla,uSharp,uRad,uNrL,uNrC,uVig,uGrain,uBW,uClip,uSeed;
uniform vec3 uHsl[8];
const float PI=3.14159265;
vec3 toLin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055,vec3(2.4)), step(0.04045,c)); }
vec3 toSrgb(vec3 c){ c=max(c,0.); return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
float lum(vec3 c){ return dot(c,vec3(0.2126,0.7152,0.0722)); }
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
uniform int uN; uniform float uShow, uLocDetail;
uniform vec4 uMA[4], uMG[4], uML[4], uMC[4], uAA[4], uAB[4], uAC[4], uAD[4];
uniform sampler2D uB0, uB1, uB2, uB3;
float brushAt(int i, vec2 s){ if(i==0) return texture(uB0,s).r; if(i==1) return texture(uB1,s).r; if(i==2) return texture(uB2,s).r; return texture(uB3,s).r; }
float maskVal(int i, vec2 suv, vec3 d){
  float type=uMA[i].x, feather=uMA[i].y, inv=uMA[i].z, op=uMA[i].w; float m=1.; float aspect=uSrcSize.x/uSrcSize.y;
  if(type==1.){ vec4 g=uMG[i]; vec2 dv=vec2((g.z-g.x)*aspect,g.w-g.y); float len2=max(dot(dv,dv),1e-6); float t=dot(vec2((suv.x-g.x)*aspect,suv.y-g.y),dv)/len2; float f=max(feather,0.001); m=1.-smoothstep(0.5-f*0.5,0.5+f*0.5,t); }
  else if(type==2.){ vec4 g=uMG[i]; float dd=length((suv-g.xy)/max(g.zw,vec2(1e-3))); float f=max(feather,0.001); m=1.-smoothstep(1.-f,1.,dd); }
  else if(type==5.){ m=brushAt(i,suv); }
  if(uML[i].w>0.5){ float y=lum(d); m*=smoothstep(uML[i].x-uML[i].z,uML[i].x,y)*(1.-smoothstep(uML[i].y,uML[i].y+uML[i].z,y)); }
  if(uMC[i].w>0.5){ vec3 h=rgb2hsv(clamp(d,0.,1.)); float dd=abs(mod(h.x*360.-uMC[i].x+180.,360.)-180.); float rng=max(uMC[i].y,1.); m*=(1.-smoothstep(rng*0.6,rng,dd))*smoothstep(uMC[i].z*0.5,uMC[i].z,h.y); }
  if(inv>0.5) m=1.-m;
  return clamp(m*op,0.,1.);
}
vec2 srcUv(vec2 uv){
  // top-left origin, y down: texture row 0 is the image's top row for every source type
  vec2 n=(vec2(uv.x,1.-uv.y)-0.5)*2.;
  n.x*=1.+uPV*0.004*n.y; n.y*=1.+uPH*0.004*n.x;   // keystone (vertical / horizontal)
  n*=1.+uDist*0.0015*dot(n,n);                      // radial lens distortion (+ barrel correction / - pincushion)
  vec2 px=n*0.5*uOutSize/uZoom; float c=cos(uAngle), s=sin(uAngle);
  px=vec2(c*px.x - s*px.y, s*px.x + c*px.y);
  return (px+uCropCenter)/uSrcSize;
}
vec3 fetchS(vec2 uv){ return texture(uSrc, clamp(uv,vec2(0.),vec2(1.))).rgb; }
// ---- creative blur effects: trilinear samples of the source mip chain (a box-filtered pyramid), so large radii stay smooth and cheap
vec3 mipAt(vec2 uv,float px){ return textureLod(uMip,clamp(uv,vec2(0.),vec2(1.)),log2(max(px*1.4,1.))).rgb; }
vec3 blurG(vec2 uv,float px){ vec2 o=vec2(px*0.5)/uSrcSize; return mipAt(uv,px)*0.36+(mipAt(uv+vec2(o.x,0.),px)+mipAt(uv-vec2(o.x,0.),px)+mipAt(uv+vec2(0.,o.y),px)+mipAt(uv-vec2(0.,o.y),px))*0.16; }

// Tone pipeline in linear light
vec3 tone(vec3 s){
  vec3 c=toLin(s);
  c*=exp2(uExp);
  // white balance as per-channel gains (relative temp/tint shift)
  float t=uTemp/100.0, g=uTint/100.0;
  c*=vec3(1.+0.30*t, 1.-0.18*g, 1.-0.30*t);
  float L=lum(c);
  float Ld=toSrgb(vec3(L)).r;                // display-referred luma for region weights
  float hiW=smoothstep(0.45,1.0,Ld), shW=1.-smoothstep(0.0,0.55,Ld);
  float whW=smoothstep(0.75,1.0,Ld), blW=1.-smoothstep(0.0,0.25,Ld);
  float k = exp2( (uHi/100.)*-1.0*hiW + (uSh/100.)*1.2*shW + (uWh/100.)*0.8*whW + (uBl/100.)*0.8*blW );
  c*=k;
  // contrast about mid-grey (0.18 linear) in a log-ish space
  float f=1.+uCon/100.*0.9;
  c=0.18*pow(max(c,1e-5)/0.18, vec3(f));
  return c;
}
vec3 colour(vec3 d){ // d is display-referred sRGB
  float L=lum(d);
  vec3 h=rgb2hsv(clamp(d,0.,1.));
  float hd=h.x*360.;
  float dh=0., ds=0., dl=0., wsum=0.;
  for(int i=0;i<8;i++){
    float cc=float(i<1?0: i==1?30: i==2?60: i==3?120: i==4?180: i==5?240: i==6?270:300);
    float dd=abs(mod(hd-cc+180.,360.)-180.);
    float w=max(0.,1.-dd/45.);
    dh+=w*uHsl[i].x; ds+=w*uHsl[i].y; dl+=w*uHsl[i].z;
  }
  h.x=fract(h.x+dh/100.*(30./360.));
  h.y=clamp(h.y*(1.+ds/100.),0.,1.);
  h.z=clamp(h.z*(1.+dl/100.*0.5*h.y),0.,1.);
  vec3 r=hsv2rgb(h);
  float L2=lum(r);
  // vibrance: boost low-saturation colours more, protect skin-ish hues a little
  float sat=h.y; float skin=smoothstep(10.,30.,hd)*(1.-smoothstep(50.,70.,hd));
  float vb=uVib/100.*(1.-sat)*(1.-0.5*skin);
  r=mix(vec3(L2),r,1.+vb+uSat/100.);
  if(uGSS>0.||uGHS>0.){ // split toning: luminance-weighted chroma offsets (zero net luminance change)
    float Y=lum(r); float mid=0.5+uGBal/100.*0.25; float ws=1.-smoothstep(0.,mid,Y); float wh=smoothstep(mid,1.,Y);
    vec3 ts=hsv2rgb(vec3(uGSh/360.,1.,1.)); vec3 th=hsv2rgb(vec3(uGHi/360.,1.,1.));
    r+=(ts-lum(ts))*ws*uGSS/100.*0.35+(th-lum(th))*wh*uGHS/100.*0.35; }
  return r;
}
vec3 gradeOf(vec3 s){
  vec3 d=toSrgb(tone(s));
  d=vec3(texture(uCurve,vec2(clamp(d.r,0.,1.)*255./256.+0.5/256.,0.5)).r,
         texture(uCurve,vec2(clamp(d.g,0.,1.)*255./256.+0.5/256.,0.5)).r,
         texture(uCurve,vec2(clamp(d.b,0.,1.)*255./256.+0.5/256.,0.5)).r);
  return colour(d);
}
void main(){
  vec2 uv=srcUv(vUv);
  vec2 tx=1./uSrcSize;
  vec3 s=fetchS(uv);
  if(uCA!=0.){ vec2 cc=uv-0.5; float k=uCA/100.*0.006; s.r=fetchS(0.5+cc*(1.+k)).r; s.b=fetchS(0.5+cc*(1.-k)).b; } // lateral chromatic aberration
  if(uDehaze>0.){ float dk=min(s.r,min(s.g,s.b)); float rad=0.006*max(uSrcSize.x,uSrcSize.y)/max(uSrcSize.x,uSrcSize.y);
    for(int i=0;i<8;i++){ float a=float(i)*PI/4.; vec3 q=fetchS(uv+vec2(cos(a),sin(a))*rad*vec2(1.,uSrcSize.x/uSrcSize.y)); dk=min(dk,min(q.r,min(q.g,q.b))); }
    float t=max(1.-uDehaze/100.*0.9*dk/max(uAir,0.3),0.28); s=clamp((s-uAir)/t+uAir,0.,1.); }
  // noise reduction: chroma blur + edge-aware luma blur
  if(uNrC>0. || uNrL>0.){
    vec3 acc=s, accL=s; float wl=1.; vec3 chromaAcc=vec3(0.); float cw=0.;
    float lc=lum(s);
    for(int i=0;i<8;i++){ float a=float(i)*PI/4.; vec2 o=vec2(cos(a),sin(a))*tx*2.0;
      vec3 n=fetchS(uv+o); float d=abs(lum(n)-lc);
      float w=exp(-d*d/(0.002+0.02*(1.-uNrL/100.))); accL+=n*w; wl+=w; chromaAcc+=n; cw+=1.; }
    vec3 lumaSm=accL/wl; vec3 cSm=(chromaAcc+s)/(cw+1.);
    float ys=lum(mix(s,lumaSm,uNrL/100.));
    vec3 chromaS=mix(s-lum(s), cSm-lum(cSm), uNrC/100.);
    s=vec3(ys)+chromaS;
  }
  // ---- creative effects (applied to the source sample, before tone/colour). blurW tells the detail stage not to re-sharpen blurred pixels.
  float blurW=0.; float LONG=max(uSrcSize.x,uSrcSize.y);
  if(uGauss>0.){ s=blurG(uv,uGauss/100.*0.035*LONG); blurW=max(blurW,min(1.,uGauss/15.)); }
  if(uBox>0.){ float px=uBox/100.*0.03*LONG; vec3 a=vec3(0.); for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) a+=mipAt(uv+vec2(float(i),float(j))*px/uSrcSize,px); s=a/9.; blurW=max(blurW,min(1.,uBox/15.)); }
  if(uMos>0.){ float B=max(2.,uMos/100.*0.07*LONG); vec2 pp=uv*uSrcSize; vec2 cpx=(floor(pp/B)+0.5)*B; s=mipAt(cpx/uSrcSize,B); blurW=1.; }
  if(uMotion>0.){ float len=uMotion/100.*0.06*LONG; vec3 a=vec3(0.); for(int i=0;i<13;i++){ float t=float(i)/12.-0.5; a+=fetchS(uv+vec2(t*len,0.)/uSrcSize); } s=a/13.; blurW=max(blurW,min(1.,uMotion/15.)); }
  if(uTilt>0.){ float yv=1.-vUv.y; float t=smoothstep(0.10,0.42,abs(yv-uFocus.y)); if(t>0.){ s=blurG(uv,t*uTilt/100.*0.03*LONG); blurW=max(blurW,t*min(1.,uTilt/20.)); } }
  if(uBokeh>0.){ vec2 f=(uv-uFocus.xy)/max(uFocus.zw,vec2(0.05)); float m=smoothstep(0.85,1.6,length(f)); float R=m*uBokeh/100.*0.03*LONG;
    if(R>0.75){ vec3 a=vec3(0.); float ws=0.; for(int i=0;i<19;i++){ float rr=sqrt((float(i)+0.5)/19.); float an=float(i)*2.39996; vec3 c=mipAt(uv+vec2(cos(an),sin(an))*rr*R/uSrcSize,max(R*0.3,1.)); float w=1.+4.*smoothstep(0.72,1.,lum(c)); a+=c*w; ws+=w; } s=a/ws; blurW=max(blurW,m); } }
  if(uSoft>0.){ vec3 b=blurG(uv,0.012*LONG); s=mix(s,1.-(1.-s)*(1.-b),uSoft/100.*0.6); }
  // detail (texture/clarity/sharpen) from neighbourhood of the source
  float Lc=lum(s);
  float b1=0., b2=0.;
  if(uSharp>0.||uTex!=0.||uCla!=0.||uLocDetail>0.5){
    for(int i=0;i<8;i++){ float a=float(i)*PI/4.; vec2 d=vec2(cos(a),sin(a));
      b1+=lum(fetchS(uv+d*tx*uRad)); b2+=lum(fetchS(uv+d*tx*uRad*6.)); }
    b1/=8.; b2/=8.;
  }
  vec3 d=gradeOf(s);
  vec3 dMask=d; float locDet=0.; float locBlur=0.;
  for(int i=0;i<4;i++){ if(i>=uN) break; float m=maskVal(i,uv,d); if(m<=0.) continue; vec4 a=uAA[i], b=uAB[i];
    vec3 lin=toLin(clamp(d,0.,1.))*exp2(a.x*m); float Ld=lum(toSrgb(lin));
    float hiW=smoothstep(0.45,1.,Ld), shW=1.-smoothstep(0.,0.55,Ld);
    lin*=exp2((-a.z/100.*hiW + a.w/100.*1.2*shW)*m); float tt=b.x/100.*m; lin*=vec3(1.+0.3*tt,1.,1.-0.3*tt);
    d=toSrgb(lin); d=(d-0.5)*(1.+a.y/100.*0.9*m)+0.5; float Ls=lum(d); d=mix(vec3(Ls),d,1.+b.y/100.*m);
    vec4 c=uAC[i], e=uAD[i];
    locDet+=m*((Lc-b2)*b.z/100.*0.9+(Lc-b1)*b.w/100.+(Lc-b1)*e.z/100.*1.5);
    if(c.x>0.){ vec3 db=gradeOf(blurG(uv,c.x/100.*0.035*LONG)); d=mix(d,db,m*min(1.,c.x/12.)); locBlur=max(locBlur,m*min(1.,c.x/15.)); }
    if(c.y>0.){ float len=c.y/100.*0.06*LONG; vec3 a2=vec3(0.); for(int k=0;k<9;k++){ float t=float(k)/8.-0.5; a2+=fetchS(uv+vec2(t*len,0.)/uSrcSize); } d=mix(d,gradeOf(a2/9.),m*min(1.,c.y/12.)); locBlur=max(locBlur,m*min(1.,c.y/15.)); }
    if(c.z>0.){ float B=max(2.,c.z/100.*0.07*LONG); vec2 cpx=(floor(uv*uSrcSize/B)+0.5)*B; d=mix(d,gradeOf(mipAt(cpx/uSrcSize,B)),m); locBlur=max(locBlur,m); }
    if(c.w>0.){ vec3 bl=gradeOf(blurG(uv,0.012*LONG)); d=mix(d,1.-(1.-d)*(1.-bl),m*c.w/100.*0.6); }
    if(e.x>0.){ d=mix(d,d*(1.-e.x/100.*0.14)+e.x/100.*0.14*0.78,m); }
    if(e.y>0.){ d+=(hash(uv*uSrcSize+7.)-0.5)*e.y/100.*0.18*m; } }
  float midW=1.-abs(lum(d)-0.5)*1.6;
  float det=(Lc-b1)*(uSharp/100.*1.5 + uTex/100.*1.0) + (Lc-b2)*(uCla/100.*0.9)*clamp(midW,0.,1.);
  d+=(det+locDet)*(1.-max(blurW,locBlur));
  if(uBloom>0.||uHal>0.){ vec3 acc=vec3(0.); float R=0.014*max(uSrcSize.x,uSrcSize.y);
    for(int i=0;i<8;i++){ float a=float(i)*PI/4.; vec2 dir=vec2(cos(a),sin(a))/uSrcSize;
      vec3 c1=fetchS(uv+dir*R*0.4), c2=fetchS(uv+dir*R*1.), c3=fetchS(uv+dir*R*2.); acc+=c1*smoothstep(0.62,1.,lum(c1))+c2*smoothstep(0.62,1.,lum(c2))+c3*smoothstep(0.62,1.,lum(c3)); } acc/=24.;
    d+=acc*uBloom/100.*1.4; d+=vec3(1.,0.32,0.08)*lum(acc)*uHal/100.*1.8; }
  if(uLutAmt>0.){ vec3 cc=clamp(d,0.,1.); vec3 lt=texture(uLut,(cc*(uLutN-1.)+0.5)/uLutN).rgb; d=mix(d,lt,uLutAmt); }
  if(uBW>0.5){ float y=lum(d); d=vec3(y); }
  // vignette (creative)
  vec2 q=(vUv-0.5)*2.; float r2=dot(q,q);
  float vg=uVig/100.*smoothstep(0.3,1.6,r2);
  d*= (uVig<0.? 1.-vg : 1.-vg);
  // grain (luma, midtone weighted, per-pixel hash)
  d=d*(1.-uFade/100.*0.14)+uFade/100.*0.14*0.78; // matte: lifted blacks
  float gr=(hash(vUv*uOutSize+uSeed)-0.5)*uGrain/100.*0.25*(0.4+0.6*midW);
  d+=gr;
  if(uShow>=0.){ float m=maskVal(int(uShow+0.5),uv,dMask); d=mix(d,vec3(1.,0.1,0.15),0.55*m); }
  // clipping warning
  if(uClip>0.5){ float m=max(d.r,max(d.g,d.b)); float mn=min(d.r,min(d.g,d.b));
    if(m>=0.995) d=vec3(1.,0.1,0.1); else if(mn<=0.004) d=vec3(0.1,0.3,1.); }
  o=vec4(clamp(d,0.,1.),1.);
}`;

export interface RenderOpts { focus?: [number, number, number, number]; airlight?: number; clipWarning?: boolean; seed?: number; locals?: LocalLayer[]; showMask?: number; lut?: import("./lut").LutState | null }

export class Renderer {
  gl: WebGL2RenderingContext; prog!: WebGLProgram; tex!: WebGLTexture; curveTex!: WebGLTexture;
  srcW = 0; srcH = 0; private loc: Record<string, WebGLUniformLocation | null> = {};
  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("WebGL2 is not available in this browser");
    this.gl = gl;
    const mk = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("Shader: " + gl.getShaderInfoLog(sh)); return sh; };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(this.prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error("Link: " + gl.getProgramInfoLog(this.prog));
    gl.useProgram(this.prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pl = gl.getAttribLocation(this.prog, "p"); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture()!; this.curveTex = gl.createTexture()!;
  }
  private brushTex: (WebGLTexture | null)[] = [null, null, null, null]; private brushSig: string[] = ["", "", "", ""];
  /** Upload (or clear) the painted-mask texture for local layer slot i. Skipped when the signature is unchanged. */
  setBrush(i: number, canvas: HTMLCanvasElement | null, sig: string) {
    const gl = this.gl; if (this.brushSig[i] === sig && this.brushTex[i]) return; this.brushSig[i] = sig;
    const t = (this.brushTex[i] ??= gl.createTexture()!); gl.activeTexture(gl.TEXTURE2 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (canvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  get maxTexture() { return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number; }
  u(name: string) { return (this.loc[name] ??= this.gl.getUniformLocation(this.prog, name)); }
  setImage(src: ImageBitmap | HTMLCanvasElement) {
    const gl = this.gl; this.srcW = src.width; this.srcH = src.height;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // never flip on upload: ImageBitmap ignores it, canvases honour it
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Mip chain for the blur effects. A sampler object on unit 7 gives uMip trilinear filtering without changing how uSrc is sampled.
    gl.generateMipmap(gl.TEXTURE_2D);
    this.mipSampler ??= (() => { const sm = gl.createSampler()!; gl.samplerParameteri(sm, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.samplerParameteri(sm, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.samplerParameteri(sm, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(sm, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return sm; })();
  }
  private mipSampler: WebGLSampler | null = null; private lutTex: WebGLTexture | null = null; private lutSrc: import("./lut").LutData | null | undefined = undefined;
  /** Output pixel size of the cropped image for a given long-edge limit. */
  outputSize(p: EditParams, longEdge: number) {
    const cw = p.crop.w * this.srcW, ch = p.crop.h * this.srcH;
    const sc = Math.min(1, longEdge / Math.max(cw, ch));
    return { w: Math.max(1, Math.round(cw * sc)), h: Math.max(1, Math.round(ch * sc)), scale: sc, cw, ch };
  }
  render(p: EditParams, longEdge: number, o: RenderOpts = {}) {
    const gl = this.gl; const size = this.outputSize(p, longEdge);
    if (this.canvas.width !== size.w || this.canvas.height !== size.h) { this.canvas.width = size.w; this.canvas.height = size.h; }
    gl.viewport(0, 0, size.w, size.h); gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(this.u("uSrc"), 0);
    const lut = buildCurveLUT(p.curve); const bytes = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) { const v = Math.round(lut[i] * 255); bytes.set([v, v, v, 255], i * 4); }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u("uCurve"), 1);
    { // 3D LUT on unit 8 (a 1x1x1 dummy is bound when unused so the sampler is always valid)
      gl.activeTexture(gl.TEXTURE8); this.lutTex ??= gl.createTexture()!; gl.bindTexture(gl.TEXTURE_3D, this.lutTex); const L = o.lut;
      if (L && L.amount > 0) { if (this.lutSrc !== L.lut) { gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, L.lut.size, L.lut.size, L.lut.size, 0, gl.RGB, gl.UNSIGNED_BYTE, L.lut.data); this.lutSrc = L.lut; gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); } }
      else if (this.lutSrc !== null) { gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 1, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]).subarray(0, 3)); this.lutSrc = null; }
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
      gl.uniform1i(this.u("uLut"), 8); gl.uniform1f(this.u("uLutAmt"), L && L.amount > 0 ? L.amount : 0); gl.uniform1f(this.u("uLutN"), L ? L.lut.size : 1); gl.activeTexture(gl.TEXTURE0); }
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.bindSampler(7, this.mipSampler); gl.uniform1i(this.u("uMip"), 7); gl.activeTexture(gl.TEXTURE0);
    // positive straighten = rotate image clockwise (Lightroom convention); sampling rotation is the inverse
    const a = (-p.straighten * Math.PI) / 180;
    // inscribed zoom so rotated crop never samples outside the image
    const ar = size.cw / size.ch; const zoomRot = Math.abs(a) < 1e-6 ? 1 : Math.cos(Math.abs(a)) + Math.max(ar, 1 / ar) * Math.sin(Math.abs(a));
    // extra zoom so keystone / distortion never samples outside the frame
    const zoom = zoomRot * (1 + 0.0035 * (Math.abs(p.perspV) + Math.abs(p.perspH))) * (1 + Math.max(0, p.distortion) * 0.0032);
    const f = (n: string, v: number) => gl.uniform1f(this.u(n), v);
    gl.uniform2f(this.u("uSrcSize"), this.srcW, this.srcH);
    gl.uniform2f(this.u("uOutSize"), size.cw, size.ch);
    gl.uniform2f(this.u("uCropCenter"), (p.crop.x + p.crop.w / 2) * this.srcW, (p.crop.y + p.crop.h / 2) * this.srcH);
    f("uAngle", a); f("uZoom", zoom);
    f("uExp", p.exposure); f("uCon", p.contrast); f("uHi", p.highlights); f("uSh", p.shadows); f("uWh", p.whites); f("uBl", p.blacks);
    f("uTemp", p.temperature); f("uTint", p.tint); f("uVib", p.vibrance); f("uSat", p.saturation);
    f("uTex", p.texture); f("uCla", p.clarity); f("uSharp", p.sharpAmount); f("uRad", p.sharpRadius);
    f("uNrL", p.nrLuma); f("uNrC", p.nrColor); f("uVig", p.vignette); f("uGrain", p.grain);
    f("uGSh", p.gradeShH); f("uGHi", p.gradeHiH); f("uGSS", p.gradeShS); f("uGHS", p.gradeHiS); f("uGBal", p.gradeBal); f("uDehaze", p.dehaze); f("uBloom", p.bloom); f("uHal", p.halation); f("uDist", p.distortion); f("uCA", p.ca); f("uPV", p.perspV); f("uPH", p.perspH); f("uAir", o.airlight ?? 0.9);
    f("uGauss", p.gaussBlur); f("uBox", p.boxBlur); f("uMos", p.mosaic); f("uMotion", p.motionBlur); f("uTilt", p.tiltShift); f("uBokeh", p.bokeh); f("uSoft", p.softFocus); f("uFade", p.fade);
    { const fo = o.focus ?? [0.5, 0.5, 0.32, 0.4]; gl.uniform4f(this.u("uFocus"), fo[0], fo[1], fo[2], fo[3]); }
    f("uBW", p.bw ? 1 : 0); f("uClip", o.clipWarning ? 1 : 0); f("uSeed", o.seed ?? 0);
    const hsl = new Float32Array(24); for (let i = 0; i < 8; i++) { hsl[i * 3] = p.hslH[i]; hsl[i * 3 + 1] = p.hslS[i]; hsl[i * 3 + 2] = p.hslL[i]; }
    gl.uniform3fv(this.u("uHsl"), hsl);
    const L = (o.locals ?? []).slice(0, MAX_LOCALS); const MA = new Float32Array(16), MG = new Float32Array(16), ML = new Float32Array(16), MC = new Float32Array(16), AA = new Float32Array(16), AB = new Float32Array(16), AC = new Float32Array(16), AD = new Float32Array(16);
    const code = { full: 0, linear: 1, radial: 2, luminance: 3, color: 4, brush: 5 } as const; let detail = 0;
    L.forEach((l, i) => { MA.set([code[l.type], l.feather, l.invert ? 1 : 0, l.visible ? l.opacity : 0], i * 4); MG.set(l.type === "linear" ? l.linear : l.radial, i * 4);
      ML.set([l.lum.lo, l.lum.hi, Math.max(0.001, l.lum.soft), l.lum.on ? 1 : 0], i * 4); MC.set([l.color.hue, l.color.range, l.color.satMin, l.color.on ? 1 : 0], i * 4);
      const a = l.adjust; AA.set([a.exposure, a.contrast, a.highlights, a.shadows], i * 4); AB.set([a.temperature, a.saturation, a.clarity, a.texture], i * 4); AC.set([a.blur ?? 0, a.motion ?? 0, a.mosaic ?? 0, a.soft ?? 0], i * 4); AD.set([a.fade ?? 0, a.grain ?? 0, a.sharpen ?? 0, 0], i * 4); if (l.visible && (a.clarity || a.texture || a.sharpen)) detail = 1; });
    gl.uniform1i(this.u("uN"), L.length); gl.uniform1f(this.u("uShow"), o.showMask ?? -1); gl.uniform1f(this.u("uLocDetail"), detail);
    gl.uniform4fv(this.u("uMA"), MA); gl.uniform4fv(this.u("uMG"), MG); gl.uniform4fv(this.u("uML"), ML); gl.uniform4fv(this.u("uMC"), MC); gl.uniform4fv(this.u("uAA"), AA); gl.uniform4fv(this.u("uAB"), AB); gl.uniform4fv(this.u("uAC"), AC); gl.uniform4fv(this.u("uAD"), AD);
    for (let i = 0; i < 4; i++) { if (!this.brushTex[i]) this.setBrush(i, null, "empty"); gl.activeTexture(gl.TEXTURE2 + i); gl.bindTexture(gl.TEXTURE_2D, this.brushTex[i]); gl.uniform1i(this.u("uB" + i), 2 + i); }
    gl.activeTexture(gl.TEXTURE0);
    void HSL_CENTERS;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return size;
  }
  toBlob(type: string, quality: number) { return new Promise<Blob | null>((r) => this.canvas.toBlob(r, type, quality)); }
}
