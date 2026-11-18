/* メガデモ（容量制限）
 * 昔のパソコンのデモシーンにならい、1つの作品を決まったバイト数に収める。
 * 数えるのは html・css・js をつないだ「そのまま開ける1ファイル」全体の UTF-8 のバイト数（tests/demo.test.mjs が上限を確かめる）。
 * 圧縮などの小技は使わない。js はそのまま数えるため、関数ではなく文字列で持つ。 */
dekiru.add({
  id: 'demo-256-tunnel', c: 'demo', lv: 2, size: 256,
  t: '256バイトの色の輪のトンネル', y: 'にひゃくごじゅうろくばいとのいろのわのとんねる',
  tags: ['メガデモ', '256バイト', 'トンネル', '極座標'],
  d: '256バイトの中で、奥へ吸い込まれていく市松模様のトンネルを描く。画面の各点を「中心からの距離」と「角度」に直し、距離の逆数を奥行き、角度を周りの位置として模様を決める。奥ほど暗くして遠さを出している。',
  p: '奥行き = 99 ÷ 中心からの距離 + 時間。この1行で、手前が大きく奥が小さい遠近法のトンネルになる。',
  html: '<canvas id=c style=width:100%>',
  js: 'x=c.getContext`2d`;t=0;setInterval(_=>{t+=.1;for(k=5e3;k--;x.fillRect(X*3+150,Y*3+75,3,3))X=k%100-50,Y=(k/100|0)-25,D=(X*X+Y*Y)**.5,u=33/D+t|0,x.fillStyle=`hsl(${u*30},80%,${(u+Math.atan2(Y,X)*3&1)*D}%)`},33)',
}, {
  id: 'demo-256-sphere', c: 'demo', lv: 2, size: 256,
  t: '256バイトの回る点の球', y: 'にひゃくごじゅうろくばいとのまわるてんのきゅう',
  tags: ['メガデモ', '256バイト', '球', '黄金角'],
  d: '600個の点を、黄金角（約137.5度）ずつ回しながら上から下へ並べると、球の表面にむらなく散らばる。それを回転させ、手前の点ほど大きく描いて立体に見せる。',
  p: '点の番号 i に 2.4 ラジアン（黄金角）を掛けた角度に置くだけで、偏りのない球になる。ひまわりの種の並びと同じ規則。',
  html: '<canvas id=c style=width:100%>',
  js: 'x=c.getContext`2d`;t=0;setInterval(_=>{c.width|=0;t+=.02;for(i=600;i--;x.fillRect(150+r*Math.cos(a)*60,75+z*60,s=2+Y,s))z=i/300-1,r=(1-z*z)**.5,Y=r*Math.sin(a=i*2.4+t),x.fillStyle=`hsl(${i},90%,50%)`},9)',
}, {
  id: 'demo-256-plasma', c: 'demo', lv: 1, size: 256,
  t: '256バイトのゆらめくプラズマ', y: 'にひゃくごじゅうろくばいとのゆらめくぷらずま',
  tags: ['メガデモ', '256バイト', 'プラズマ', 'sin'],
  d: '縦・横・斜め・同心円の4つの波（sin）を足し合わせ、その値を色相と明るさに置き換える。昔のデモで定番だった「プラズマ」を256バイトで描く。',
  p: '4つの波の位相を時間で別々の向きにずらすので、模様が溶け合うように流れ続ける。',
  html: '<canvas id=c style=width:100%>',
  js: 'x=c.getContext`2d`;S=Math.sin;t=0;setInterval(_=>{t+=.04;for(k=5e3;k--;x.fillRect(i*3,j*3,3,3))i=k%100,j=k/100|0,v=S(i/5+t)+S(j/4-t)+S((i+j)/6+t)+S(i*j/150-t*2),x.fillStyle=`hsl(${v*50},90%,${55+v*9}%)`},33)',
});
dekiru.add({
  id: 'demo-1k-corridor', c: 'demo', lv: 3, size: 1024,
  t: '1Kの光る球が並ぶ回廊', y: 'わんけーのひかるたまがならぶかいろう',
  tags: ['メガデモ', '1キロバイト', 'レイマーチング', 'WebGL2'],
  d: '1024バイトの中に WebGL2 の準備と描画の式をすべて入れ、無限に並ぶ球の間をねじれながら進んでいく映像を描く。視線が球の近くを通るほど光を集めるので、球のまわりがうっすら光って見える。',
  p: '空間を mod で区切ると、球1つ分の式だけで無限に並ぶ球になる。三角形の頂点は gl_VertexID から作るので、頂点のデータを送る処理も省いている。',
  html: '<canvas id=c style=position:fixed;inset:0;width:100%;height:100%>',
  js: 'c.width=innerWidth/2;c.height=innerHeight/2;g=c.getContext`webgl2`;P=g.createProgram();k=35633;for(s of[`#version 300 es\nvoid main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}`,`#version 300 es\nprecision highp float;uniform vec3 u;out vec4 o;float m(vec3 p){p.xy*=mat2(cos(p.z*.12+u.z*.3+vec4(0,11,33,0)));return length(mod(p,4.)-2.)-.7;}void main(){vec3 d=normalize(vec3((gl_FragCoord.xy*2.-u.xy)/u.y,1.5)),p=vec3(0,0,u.z*3.);float s=1.,g=0.,i=0.;for(;i<99.&&s>.001;i++)p+=d*(s=m(p))*.7,g+=.002/(.01+s*s);float f=1.-i/99.;o=vec4((.55+.45*cos(floor(p.z/4.)*.9+u.z+vec3(0,2,4)))*f*f*1.6*exp(-.05*(p.z-u.z*3.))+g*.02*vec3(.4,.6,1),1);}`])S=g.createShader(k--),g.shaderSource(S,s),g.compileShader(S),g.attachShader(P,S);g.linkProgram(P);g.useProgram(P);L=T=>{g.uniform3f(g.getUniformLocation(P,`u`),c.width,c.height,T/1e3);g.drawArrays(4,0,3);requestAnimationFrame(L)};L(0)',
}, {
  id: 'demo-1k-voxel', c: 'demo', lv: 3, size: 1024,
  t: '1Kのボクセルの谷を飛ぶ', y: 'わんけーのぼくせるのたにをとぶ',
  tags: ['メガデモ', '1キロバイト', 'ボクセル', '高さの地図'],
  d: '波を重ねて作った高さの地図の上を、低く飛び続ける。画面の縦1列ごとに手前から奥へ地面の高さを調べ、前より高く見えた所だけを塗る。水・砂・草・岩・雪を高さで塗り分け、遠くほど空の色にかすませる。',
  p: '奥へ進むほど調べる間隔を広げるので、遠くまで描いても計算が増えすぎない。列ごとに「ここまで塗った」高さを覚えておくと、隠れた所を描かずに済む。',
  html: '<canvas id=c style=position:fixed;inset:0;width:100%;height:100%;image-rendering:pixelated>',
  js: 'x=c.getContext`2d`;W=c.width=320;H=c.height=180;I=x.createImageData(W,H);U=new Uint32Array(I.data.buffer);M=Math;h=(X,Y)=>45*M.sin(X/60)*M.cos(Y/47)+12*M.sin(X/13+Y/17)+5*M.cos(Y/7-X/9);L=T=>{t=T/30;C=M.sin(t/99)*80;E=h(C,t)+50;for(i=W*H;i--;)U[i]=255<<24|(240-i/W/2)<<16|(200-i/W/3)<<8|150;for(i=0;i<W;i++){b=H;for(z=2;z<500;z+=z/60+.3){e=h(C+(i/W-.5)*z,t+z);y=(E-e)/z*90+50|0;if(y<b){f=z/500;k=e<-20?[40,90,180]:e<-12?[210,190,120]:e<20?[60,140,50]:e<40?[120,110,100]:[250,250,255];r=k[0]*(1-f)+150*f;q=k[1]*(1-f)+190*f;w=k[2]*(1-f)+230*f;for(y<0&&(y=0);b>y;)U[--b*W+i]=255<<24|w<<16|q<<8|r}}}x.putImageData(I,0,0);requestAnimationFrame(L)};L(0)',
}, {
  id: 'demo-1k-kaleido', c: 'demo', lv: 3, size: 1024,
  t: '1Kの光の万華鏡', y: 'わんけーのひかりのまんげきょう',
  tags: ['メガデモ', '1キロバイト', '万華鏡', 'フラクタル'],
  d: '画面を6つの扇に分けて鏡のように折り返し、その中で「折り返す・回す・広げる」を8回繰り返して模様を作る。繰り返しのたびに細い光の線が生まれ、ゆっくり回りながら形を変え続ける。',
  p: 'abs() で座標を折り返すのが鏡の役。折り返しと回転を重ねると、式は短くても入り組んだ模様になる（KIFS と呼ばれる方法）。',
  html: '<canvas id=c style=position:fixed;inset:0;width:100%;height:100%>',
  js: 'c.width=innerWidth/2;c.height=innerHeight/2;g=c.getContext`webgl2`;P=g.createProgram();k=35633;for(s of[`#version 300 es\nvoid main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}`,`#version 300 es\nprecision highp float;uniform vec3 u;out vec4 o;void main(){vec2 p=(gl_FragCoord.xy*2.-u.xy)/u.y;float t=u.z*.3,a=atan(p.y,p.x),r=length(p);a=abs(mod(a+t*.2,1.047)-.524);p=r*vec2(cos(a),sin(a));vec3 c=vec3(0);for(float i=0.;i<8.;i++){p=abs(p*1.4)-vec2(1,.4)*(1.+.3*sin(t+i));p*=mat2(cos(t*.5+i+vec4(0,11,33,0)));c+=exp(-abs(p.y)*12.)*(.5+.5*cos(i*.7+t*2.+vec3(0,2,4)))*.3;}o=vec4(c,1);}`])S=g.createShader(k--),g.shaderSource(S,s),g.compileShader(S),g.attachShader(P,S);g.linkProgram(P);g.useProgram(P);L=T=>{g.uniform3f(g.getUniformLocation(P,`u`),c.width,c.height,T/1e3);g.drawArrays(4,0,3);requestAnimationFrame(L)};L(0)',
}, {
  id: 'demo-1k-swirl', c: 'demo', lv: 2, size: 1024,
  t: '1Kの1万粒が描く渦', y: 'わんけーのいちまんつぶがえがくうず',
  tags: ['メガデモ', '1キロバイト', '粒子', '流れの場'],
  d: '1万個の光の粒が、場所と時間で向きの変わる見えない流れに乗って動く。前の画面をうっすら残しながら重ねて描くので、粒の通った跡が光の筋になって、渦や川のような模様が現れては消える。',
  p: '粒の進む向きは「その場所の sin と cos を足した角度」だけで決まる。全部の粒が同じ式に従うので、近くの粒どうしがそろって流れ、模様に見える。',
  html: '<canvas id=c style=position:fixed;inset:0;background:#000>',
  js: 'W=c.width=innerWidth;H=c.height=innerHeight;x=c.getContext`2d`;R=Math.random;P=[];for(i=1e4;i--;)P.push([R()*W,R()*H,R()*99]);L=T=>{t=T/2e3;x.globalCompositeOperation=`source-over`;x.fillStyle=`#0002`;x.fillRect(0,0,W,H);x.globalCompositeOperation=`lighter`;for(p of P){a=Math.sin(p[0]/150+t)*2+Math.cos(p[1]/110-t*.7)*2+Math.sin((p[0]+p[1])/300+t*.3);p[0]+=Math.cos(a)*1.5;p[1]+=Math.sin(a)*1.5;if(p[0]<0|p[0]>W|p[1]<0|p[1]>H|R()<.002)p[0]=R()*W,p[1]=R()*H;x.fillStyle=`hsl(${a*40+p[2]+t*50|0},90%,50%,.6)`;x.fillRect(p[0],p[1],1.5,1.5)}requestAnimationFrame(L)};L(0)',
});

dekiru.add({
  id: "demo-4k-oldschool",
  c: "demo",
  lv: 3,
  size: 4096,
  t: "4Kの昔のパソコン風デモ",
  y: "よんけーのむかしのぱそこんふうでも",
  tags: ["メガデモ","4キロバイト","ラスターバー","チップチューン"],
  d: "1980〜90年代のパソコンのデモでおなじみだった、横に流れる虹色の帯（ラスターバー）、波打ちながら流れる文字、3段の速さで流れる星、奥へ流れる市松模様の床を、320×200の粗い画面に描く。画面を押すと、矩形波と三角波と雑音で作った電子音の曲が流れる。",
  p: "曲は「ベース・分散和音・旋律・太鼓」の4つを、16分音符1つずつ AudioContext の時計で予約して鳴らす。音のデータは持たず、和音の表と旋律の文字列だけから毎回組み立てる。",
  html: "<canvas id=c style=position:fixed;inset:0;width:100%;height:100%;image-rendering:pixelated></canvas><p id=m style=position:fixed;bottom:0;width:100%;text-align:center;color:#fff;font:14px/2 sans-serif>画面を押すと音が出ます</p>",
  js: "x=c.getContext`2d`;W=c.width=320;H=c.height=200;M=Math;S=M.sin;A=0;Q=0;st=[];for(i=99;i--;)st.push([M.random()*W,M.random()*120,i%3+1]);\r\nT=`出来る！ HTML・CSS・JavaScript だけで作った 4096バイトのメガデモ ・ ライブラリなし ・ 昔のパソコンのデモに敬意をこめて ・ 小さなナイフ一本で ここまで出来る ・ ・ ・ `;\r\nF=m=>440*2**((m-69)/12);\r\nV=(m,t,d,y,v)=>{o=A.createOscillator();g=A.createGain();o.type=y;o.frequency.value=F(m);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g).connect(O);o.start(t);o.stop(t+d)};\r\nZ=(t,d,v,f)=>{s=A.createBufferSource();s.buffer=B;g=A.createGain();h=A.createBiquadFilter();h.type=`highpass`;h.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(h).connect(g).connect(O);s.start(t);s.stop(t+d)};\r\nC=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];L=`a.c.e.d.c.a.g.e.a.c.e.g.f.e.d.c.`;\r\nP=()=>{for(;Q<A.currentTime+.2;Q+=.107){n=K++,b=n>>4&3,k=n&15,ch=C[b];\r\nk%4||V(30,Q,.25,`sine`,.9);k%8==4&&Z(Q,.15,.5,1500);k%2&&Z(Q,.04,.2,7e3);\r\nk%2||V(ch[0]-24,Q,.2,`triangle`,.5);V(ch[k%3]+12,Q,.09,`square`,.06);\r\nq=L[n&31];q!=`.`&&n>63&&V(ch[0]+12+[0,2,4,7,9,12,14][`abcdefg`.indexOf(q)],Q,.3,`square`,.08)}};\r\nonclick=_=>{if(!A){A=new AudioContext;O=A.createGain();O.gain.value=.3;O.connect(A.destination);B=A.createBuffer(1,9e3,9e3);for(i=9e3;i--;)B.getChannelData(0)[i]=M.random()*2-1;K=0;Q=A.currentTime+.1;setInterval(P,50);m.remove()}};\r\nR=t=>{t/=1e3;x.fillStyle=`#000`;x.fillRect(0,0,W,H);\r\nfor(s of st)s[0]=(s[0]-s[2]*.6+W)%W,x.fillStyle=`rgba(200,220,255,${s[2]/3})`,x.fillRect(s[0],s[1],s[2],1);\r\nfor(i=6;i--;){y=60+S(t*1.3+i*.5)*45;for(j=-8;j<9;j++)x.fillStyle=`hsl(${i*60+t*40},90%,${60-M.abs(j)*7}%)`,x.fillRect(0,y+j,W,1)}\r\nfor(y=140;y<H;y++){z=600/(y-130);for(i=0;i<W;i+=4)x.fillStyle=((i-160)*z/500+t*2&1)^(z/5+t*4&1)?`#28c`:`#126`,x.fillRect(i,y,4,1)}\r\nx.font=`bold 46px sans-serif`;x.textAlign=`center`;g=x.createLinearGradient(0,0,W,0);for(i=7;i--;)g.addColorStop(i/6,`hsl(${i*50+t*90},100%,60%)`);x.fillStyle=g;x.fillText(`出来る！`,W/2+S(t)*30,70+M.abs(S(t*3))*-30);\r\nx.font=`bold 16px sans-serif`;x.textAlign=`left`;p=W-(t*60)%(T.length*16+W);for(i=0;i<T.length;i++)X=p+i*16,X>-16&&X<W&&(x.fillStyle=`hsl(${X+t*99},100%,70%)`,x.fillText(T[i],X,128+S(X/30+t*4)*8));\r\nrequestAnimationFrame(R)};R(0)",
}, {
  id: "demo-4k-dawn",
  c: "demo",
  lv: 3,
  size: 4096,
  t: "4Kの夜が明けていく海",
  y: "よんけーのよがあけていくうみ",
  tags: ["メガデモ","4キロバイト","海","アンビエント"],
  d: "星の残る夜の海から始まり、水平線が赤く染まって日が昇り、昼の青い空へ移っていく。6つの波を重ねた海面に空と太陽が映り込む。画面を押すと、ゆっくり開いて閉じる和音と、こだまする鐘の音が流れる。",
  p: "空と海の色は「太陽の高さ」1つの数から全部決まる。夜は星を足し、地平線の近くに太陽がある間だけ赤みを足すので、時間の流れが自然につながる。",
  html: "<canvas id=c style=position:fixed;inset:0;width:100%;height:100%></canvas><p id=m style=position:fixed;bottom:0;width:100%;text-align:center;color:#fff;font:14px/2 sans-serif>画面を押すと音が出ます</p>",
  js: "c.width=innerWidth/2;c.height=innerHeight/2;g=c.getContext`webgl2`;P=g.createProgram();k=35633;for(s of[`#version 300 es\nvoid main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}`,`#version 300 es\nprecision highp float;uniform vec3 u;out vec4 o;float t;\nfloat h(vec2 p){float r=0.,a=.5,f=.35;vec2 d=vec2(1,.3);for(int i=0;i<6;i++){float w=1.-abs(sin(dot(normalize(d),p)*f+t*sqrt(f)*1.3));r+=a*w*w;d*=mat2(.8,-.6,.6,.8);a*=.5;f*=1.9;}return r;}\nvec3 sky(vec3 d,vec3 s){float y=max(d.y,0.),k=max(dot(d,s),0.),n=clamp(s.y*3.+.3,0.,1.);vec3 c=mix(vec3(.01,.02,.07),mix(vec3(1,.5,.3),vec3(.25,.45,.85),pow(y,.4)),n);c+=vec3(1,.55,.3)*pow(1.-y,6.)*clamp(1.-abs(s.y)*3.,0.,1.)*.7;c+=vec3(1,.8,.5)*(pow(k,600.)*9.+pow(k,9.)*.3)*clamp(s.y*9.+.6,0.,1.);vec2 g=floor(d.xz/max(d.y,.03)*60.);c+=step(.997,fract(sin(dot(g,vec2(12.9,78.2)))*43758.))*(1.-n)*smoothstep(0.,.2,y);return c;}\nvoid main(){t=u.z;vec2 q=(gl_FragCoord.xy*2.-u.xy)/u.y;vec3 s=normalize(vec3(.2,sin(t*.04-.3)*.5,-1)),d=normalize(vec3(q.x,q.y-.12,-1.6)),r=vec3(0,2.2,-t),c;if(d.y>0.)c=sky(d,s);else{float z=(r.y-1.3)/-d.y;vec3 p;for(int i=0;i<36;i++){p=r+d*z;z+=(p.y-h(p.xz))*.7;}p=r+d*z;float e=.04+z*.003,v=h(p.xz);vec3 n=normalize(vec3(v-h(p.xz+vec2(e,0)),e,v-h(p.xz+vec2(0,e))));float f=pow(1.-max(dot(n,-d),0.),4.)*.85+.03;c=mix(vec3(0,.06,.1)*(.2+max(s.y,0.)*2.),sky(reflect(d,n),s),f);c=mix(c,sky(vec3(d.x,.01,d.z),s),1.-exp(-z*.012));}o=vec4(pow(c,vec3(.85)),1);}`])S=g.createShader(k--),g.shaderSource(S,s),g.compileShader(S),g.attachShader(P,S);g.linkProgram(P);g.useProgram(P);L=T=>{g.uniform3f(g.getUniformLocation(P,`u`),c.width,c.height,T/1e3);g.drawArrays(4,0,3);requestAnimationFrame(L)};L(0);\nA=0;F=m=>440*2**((m-69)/12);\nC=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,62]];N=[0,2,4,7,9];\npad=(ch,t)=>ch.map(m=>[0,7].map(dt=>{o=A.createOscillator();f=A.createBiquadFilter();v=A.createGain();o.type=`sawtooth`;o.frequency.value=F(m);o.detune.value=dt;f.type=`lowpass`;f.frequency.setValueAtTime(400,t);f.frequency.linearRampToValueAtTime(1400,t+2);f.frequency.linearRampToValueAtTime(400,t+4.8);v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(.05,t+1.5);v.gain.linearRampToValueAtTime(0,t+5);o.connect(f).connect(v).connect(O);o.start(t);o.stop(t+5)}));\nbell=(m,t)=>[[1,1,2.5],[2.76,.3,.8],[5.4,.15,.4]].map(([r,a,d])=>{o=A.createOscillator();v=A.createGain();o.frequency.value=F(m)*r;v.gain.setValueAtTime(a*.12,t);v.gain.exponentialRampToValueAtTime(1e-4,t+d);o.connect(v);v.connect(O);v.connect(D);o.start(t);o.stop(t+d)});\nPl=()=>{for(;Q<A.currentTime+.5;Q+=.4){b=K>>3&3;K%8||pad(C[b],Q);if(Math.random()<.45)bell(72+N[Math.random()*5|0]+(Math.random()<.3)*12,Q);K++}};\nonclick=_=>{if(A)return;A=new AudioContext;O=A.createGain();O.gain.value=.5;O.connect(A.destination);D=A.createDelay();D.delayTime.value=.6;G=A.createGain();G.gain.value=.45;D.connect(G).connect(D);G.connect(A.destination);K=0;Q=A.currentTime+.1;setInterval(Pl,100);m.remove()}",
}, {
  id: "demo-4k-city",
  c: "demo",
  lv: 3,
  size: 4096,
  t: "4Kの夜の光の街を飛ぶ",
  y: "よんけーのよるのひかりのまちをとぶ",
  tags: ["メガデモ","4キロバイト","レイマーチング","シンセサイザー"],
  d: "高さのばらばらなビルが並ぶ夜の街の大通りを、ゆれながら低く飛び抜ける。ビルの窓は1つずつ点いたり消えたりし、屋上のふちは色とりどりに光る。雨に濡れた道路には街の明かりが映り込む。画面を押すと、ベースと太鼓とこだまする旋律の曲が流れる。",
  p: "ビルは「6×6の区画ごとに1つの箱」という式だけで、無限に続く街になる。道路に当たった視線は、上へ折り返してもう一度飛ばし、映り込みを作っている。",
  html: "<canvas id=c style=position:fixed;inset:0;width:100%;height:100%></canvas><p id=m style=position:fixed;bottom:0;width:100%;text-align:center;color:#fff;font:14px/2 sans-serif>画面を押すと音が出ます</p>",
  js: "c.width=innerWidth/2;c.height=innerHeight/2;g=c.getContext`webgl2`;P=g.createProgram();k=35633;for(s of[`#version 300 es\r\nvoid main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}`,`#version 300 es\r\nprecision highp float;uniform vec3 u;out vec4 o;\r\nfloat H(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}\r\nfloat hb(vec2 id){return id.x==0.?0.:3.+H(id)*16.*H(id+7.);}\r\nfloat M(vec3 p){vec2 id=floor(p.xz/6.),q=mod(p.xz,6.)-3.;float h=hb(id);vec3 d=abs(vec3(q.x,p.y-h*.5,q.y))-vec3(2.2,h*.5,2.2);return min(p.y,min(length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.),3.));}\r\nfloat T(vec3 r,vec3 d,float n){float z=.1,s;for(float i=0.;i<n;i++){s=M(r+d*z);if(s<.002*z||z>140.)break;z+=s*.8;}return z;}\r\nvec3 sky(vec3 d){return mix(vec3(.25,.05,.3),vec3(.02,.01,.08),sqrt(max(d.y,0.)))+step(.996,H(floor(d.xy*300.)))*step(.1,d.y)*.8;}\r\nvec3 S(vec3 r,vec3 d,float z){vec3 p=r+d*z;if(z>140.)return sky(d);vec2 e=vec2(.01,0);vec3 n=normalize(vec3(M(p+e.xyy)-M(p-e.xyy),M(p+e.yxy)-M(p-e.yxy),M(p+e.yyx)-M(p-e.yyx)));vec2 id=floor(p.xz/6.);float h=hb(id);vec3 c=vec3(.03,.03,.06)*(.5+.5*n.y);\r\nif(h>0.&&p.y>.05){vec2 w=vec2(abs(n.x)>.5?p.z:p.x,p.y)*vec2(1.6,1.3);vec2 f=fract(w);c+=step(.25,f.x)*step(.3,f.y)*step(.6,H(floor(w)+id*7.))*mix(vec3(1,.75,.4),vec3(.4,.8,1),H(id+3.))*.9+step(h-.25,p.y)*(.5+.5*cos(H(id)*6.+vec3(0,2,4)))*2.;}else c=vec3(.06,.05,.09)+step(.85,fract(p.z*.15))*step(abs(p.x-3.),.07)*vec3(1,.8,.3);\r\nreturn mix(c,vec3(.3,.08,.35),1.-exp(-z*.022));}\r\nvoid main(){float t=u.z;vec2 q=(gl_FragCoord.xy*2.-u.xy)/u.y;vec3 r=vec3(3.+sin(t*.4)*.9,2.5+sin(t*.6)*1.2,t*9.),d=normalize(vec3(q.x+sin(t*.3)*.15,q.y-.15,1.3));float z=T(r,d,110.);vec3 c=S(r,d,z),p=r+d*z;\r\nif(p.y<.02&&z<140.){vec3 d2=reflect(d,vec3(0,1,0));float z2=T(p+vec3(0,.01,0),d2,60.);c=mix(c,S(p,d2,z2),.55);}\r\no=vec4(pow(c,vec3(.8)),1);}`])S=g.createShader(k--),g.shaderSource(S,s),g.compileShader(S),g.attachShader(P,S);g.linkProgram(P);g.useProgram(P);L=T=>{g.uniform3f(g.getUniformLocation(P,`u`),c.width,c.height,T/1e3);g.drawArrays(4,0,3);requestAnimationFrame(L)};L(0);\r\nA=0;F=m=>440*2**((m-69)/12);\r\nV=(m,t,d,y,v,f)=>{o=A.createOscillator();l=A.createBiquadFilter();n=A.createGain();o.type=y;o.frequency.value=F(m);l.frequency.setValueAtTime(f,t);l.frequency.exponentialRampToValueAtTime(200,t+d);n.gain.setValueAtTime(v,t);n.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(l).connect(n).connect(O);n.connect(D);o.start(t);o.stop(t+d)};\r\nZ=(t,d,v,f)=>{b=A.createBufferSource();b.buffer=N;l=A.createBiquadFilter();l.type=`highpass`;l.frequency.value=f;n=A.createGain();n.gain.setValueAtTime(v,t);n.gain.exponentialRampToValueAtTime(.001,t+d);b.connect(l).connect(n).connect(O);b.start(t);b.stop(t+d)};\r\nK0=t=>{o=A.createOscillator();n=A.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(40,t+.12);n.gain.setValueAtTime(1,t);n.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(n).connect(O);o.start(t);o.stop(t+.3)};\r\nC=[45,41,48,43];Me=[69,72,76,74,72,69,67,64,69,72,76,79,81,79,76,74];\r\nPl=()=>{for(;Q<A.currentTime+.2;Q+=.134){j=K++;s=j&15;r=C[j>>4&3];s%4||K0(Q);s%8==4&&Z(Q,.2,.6,1200);s%2&&Z(Q,.05,.25,8e3);\r\nV(r-12+(s%2)*12,Q,.13,`sawtooth`,.3,1800);s%2||V(r+12+[0,3,7,12][s/2&3],Q,.12,`square`,.05,3e3);j>63&&s%4==0&&V(Me[(j>>2)&15],Q,.5,`sawtooth`,.08,4e3)}};\r\nonclick=_=>{if(A)return;A=new AudioContext;O=A.createGain();O.gain.value=.35;O.connect(A.destination);D=A.createDelay();D.delayTime.value=.402;G=A.createGain();G.gain.value=.35;D.connect(G).connect(D);G.connect(A.destination);N=A.createBuffer(1,9e3,9e3);for(i=9e3;i--;)N.getChannelData(0)[i]=Math.random()*2-1;K=0;Q=A.currentTime+.1;setInterval(Pl,50);m.remove()}",
});

/* 20 行のコード（2026-11-18 追加）
 * 容量ではなく行数で制限する。HTML・CSS・JavaScript を合わせて 20 行以内、1 行は 120 文字まで、コメントは書かない（説明は説明文に書く）。
 * どれも止めるか鳴らすボタンを 20 行の中に入れる。決まりは tests/short20.test.mjs が確かめる。 */
dekiru.add({
  id: 'demo-20-blackhole', c: 'demo', lv: 3,
  t: '20行のブラックホールと光の輪', y: 'にじゅうぎょうのぶらっくほーるとひかりのわ',
  tags: ['20行', 'ブラックホール', '重力レンズ', 'レイマーチング', 'WebGL2'],
  d: '20 行のコードで、ブラックホールのまわりで光が曲がる様子を描く。画面の点ごとに光の道を少しずつ進め、そのたびに中心へ引く重力で向きを曲げる（距離の 2 乗に反比例）。道が円盤の面（y = 0）を横切れば円盤の光を足し、中心の 1 より内側に落ちれば真っ黒にする。円盤の奥側の光も上と下へ回り込んで見える。こちらへ近づいて回る側は明るく、遠ざかる側は暗い（ドップラー効果）。',
  p: '光の道を「まっすぐ進む」から「毎歩、少し曲げる」に変えるだけで、重力レンズが現れる。曲げる強さを変えると、光の輪の大きさが変わる。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const F = `uniform vec3 R;out vec4 O;float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5);}
    void main(){vec2 u=(gl_FragCoord.xy-.5*R.xy)/R.y;float a=R.z*.05;vec3 o=vec3(22.*sin(a),2.2,-22.*cos(a));
    vec3 f=normalize(-o),s=normalize(cross(f,vec3(0,1,0))),d=normalize(f*1.4+u.x*s+u.y*cross(s,f)),c=vec3(0);
    float k=1.;for(int i=0;i<500;i++){float r=length(o),e=.02*r;vec3 q=o;d=normalize(d-o*e*1.5/(r*r*r));o+=d*e;
    if(r<1.){k=0.;break;}if(q.y*o.y<0.){float x=length(o.xz),v=dot(normalize(vec3(o.z,0,-o.x)),d);
    if(x>2.4&&x<9.){float g=pow(2.4/x,1.6)*(.88+.12*sin(x*5.-atan(o.z,o.x)*2.+R.z*2.))*(1.+.8*v);
    c+=k*vec3(1.5,.75,.35)*g*g*2.;k*=.3;}}if(r>40.)break;}
    c+=k*pow(h(floor(d*500.)),50.)*vec3(.8,.9,1)*3.;O=vec4(1.-exp(-c*1.5),1);}`;
    const g = c.getContext('webgl2'), P = g.createProgram(), H = '#version 300 es\nprecision highp float;'; let l = 0;
    for (const [k, s] of [[35633, 'void main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}'], [35632, F]]) {
      const o = g.createShader(k); g.shaderSource(o, H + s); g.compileShader(o); g.attachShader(P, o); }
    g.linkProgram(P); g.useProgram(P); let t = 0, run = 1; b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす';
    (function f(n) { requestAnimationFrame(f); t += run * (n - l) / 1e3; l = n; const w = innerWidth, h = innerHeight;
      if (c.width - w || c.height - h) c.width = w, c.height = h; g.viewport(0, 0, w, h);
      g.uniform3f(g.getUniformLocation(P, 'R'), w, h, t); g.drawArrays(4, 0, 3); })(0);
  },
}, {
  id: 'demo-20-raytrace', c: 'demo', lv: 3,
  t: '20行の鏡の球のレイトレーシング', y: 'にじゅうぎょうのかがみのたまのれいとれーしんぐ',
  tags: ['20行', 'レイトレーシング', '反射', '影', 'WebGL2'],
  d: '20 行のコードで、色の付いた鏡の球が回る部屋を描く。画面の点ごとに光の道を出し、球と床のどちらに先に当たるかを方程式で求める。球に当たれば反射して次の物を探し（5 回まで）、床に当たれば市松の色に、太陽が隠れていれば影にする。球は互いに映り込み、映り込みの中にさらに映り込みが見える。',
  p: '球との交わりは 2 次方程式 1 つで求まる。反射の向きは reflect(向き, 面の法線) の 1 回だけ。あとは繰り返すほど、映り込みが深くなる。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const F = `uniform vec3 R;out vec4 O;float T(vec3 o,vec3 d,out vec3 n,out int m){float b=1e9;m=-1;
    if(d.y<0.){b=-o.y/d.y;n=vec3(0,1,0);m=4;}for(int i=0;i<4;i++){float a=R.z*.5+float(i)*2.1,r=i<3?1.:1.2;
    vec3 q=o-(i<3?vec3(2.4*cos(a),1,2.4*sin(a)):vec3(0,1.4,0));float B=dot(q,d),D=B*B-dot(q,q)+r*r,t=-B-sqrt(D);
    if(D>0.&&t>1e-3&&t<b){b=t;n=normalize(q+d*t);m=i;}}return b;}
    void main(){vec2 u=(gl_FragCoord.xy-.5*R.xy)/R.y;float a=R.z*.15;vec3 o=vec3(8.*sin(a),3.5,8.*cos(a)),n,w;
    vec3 f=normalize(vec3(0,1,0)-o),s=normalize(cross(f,vec3(0,1,0))),d=normalize(f*1.6+u.x*s+u.y*cross(s,f));
    vec3 c=vec3(0),k=vec3(1),L=normalize(vec3(1,1.6,.6));for(int j=0;j<5;j++){int m,z;float t=T(o,d,n,m);
    if(m<0){c+=k*(mix(vec3(.95,.8,.6),vec3(.2,.45,.9),d.y)+9.*pow(max(dot(d,L),0.),300.));break;}
    o+=d*t+n*1e-3;float sh=T(o,L,w,z)<1e8?.25:1.;if(m==4){vec2 q=floor(o.xz);
    c+=k*mix(vec3(.85),vec3(.08),mod(q.x+q.y,2.))*sh*max(dot(n,L),0.)*exp(-length(o.xz)*.06);break;}
    k*=(m==3?vec3(1,.75,.35):vec3(m==0,m==1,m==2)*.45+.5)*.9;c+=k*sh*.04;d=reflect(d,n);}O=vec4(pow(c,vec3(.45)),1);}`;
    const g = c.getContext('webgl2'), P = g.createProgram(), H = '#version 300 es\nprecision highp float;'; let l = 0;
    for (const [k, s] of [[35633, 'void main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}'], [35632, F]]) {
      const o = g.createShader(k); g.shaderSource(o, H + s); g.compileShader(o); g.attachShader(P, o); }
    g.linkProgram(P); g.useProgram(P); let t = 0, run = 1; b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす';
    (function f(n) { requestAnimationFrame(f); t += run * (n - l) / 1e3; l = n; const w = innerWidth, h = innerHeight;
      if (c.width - w || c.height - h) c.width = w, c.height = h; g.viewport(0, 0, w, h);
      g.uniform3f(g.getUniformLocation(P, 'R'), w, h, t); g.drawArrays(4, 0, 3); })(0);
  },
}, {
  id: 'demo-20-planet', c: 'demo', lv: 3,
  t: '20行で作る惑星', y: 'にじゅうぎょうでつくるわくせい',
  tags: ['20行', '惑星', 'ノイズ', '大気', 'WebGL2'],
  d: '20 行のコードで、自転する惑星を 1 つ作る。球の表面の点ごとに 3 次元のノイズを 6 段重ね、値の低い所を海、高い所を陸・山にし、極に近い所は氷にする。雲は別のノイズで速く流し、縁には青い大気の光を足す。太陽の当たらない夜の側では、陸に街の灯りがともる。海だけ太陽の照り返しが光る。',
  p: '地図のデータは 1 つもない。同じノイズの関数を、大きさを変えて何度も足すだけで、海岸線・山脈・雲の渦が現れる。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const F = `uniform vec3 R;out vec4 O;vec4 H(float k){return fract(sin(k+vec4(0,1,57,58))*43758.5);}float n(vec3 x){
    vec3 p=floor(x),f=fract(x);f*=f*(3.-2.*f);float k=p.x+p.y*57.+p.z*113.;vec4 a=mix(H(k),H(k+113.),f.z);
    return mix(mix(a.x,a.y,f.x),mix(a.z,a.w,f.x),f.y);}float N(vec3 p){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*n(p);
    p=p*2.03+1.7;a*=.5;}return s;}void main(){vec2 u=(gl_FragCoord.xy-.5*R.xy)/R.y;vec3 d=normalize(vec3(u,-2)),o=vec3(0,0,
    3.3),L=normalize(vec3(1,.3,.5));float B=dot(o,d),D=B*B-dot(o,o)+1.,a=R.z*.1;vec3 c=vec3(pow(H(dot(floor(d*700.),vec3(1,
    57,113))).x,80.)*2.);c+=vec3(.25,.45,1)*exp(-max(sqrt(dot(o,o)-B*B)-1.,0.)*14.)*.6;if(D>0.){vec3 p=o+d*(-B-sqrt(D)),q=p;
    q.xz*=mat2(cos(a),sin(a),-sin(a),cos(a));float e=N(q*2.5),l=dot(p,L),C=smoothstep(.55,.75,N(q*4.+vec3(a*.6,0,0)));
    vec3 g=e<.5?mix(vec3(.01,.05,.2),vec3(.03,.25,.45),e*2.):mix(vec3(.12,.3,.08),vec3(.5,.42,.3),e*3.-1.5);g=mix(g,
    vec3(.95),smoothstep(.72,.8,abs(q.y)+e*.15));vec3 s=g*max(l,0.)+float(e<.5)*pow(max(dot(reflect(d,p),L),0.),40.)+vec3(1,
    .65,.3)*float(e>.5)*step(.9,H(dot(floor(q*120.),vec3(1,57,113))).x)*smoothstep(0.,-.25,l);c=mix(s,vec3(max(l,0.)),
    C*.85)+vec3(.3,.5,1)*pow(1.-dot(-d,p),3.)*max(l+.3,0.);}O=vec4(pow(c,vec3(.45)),1);}`;
    const g = c.getContext('webgl2'), P = g.createProgram(), H = '#version 300 es\nprecision highp float;'; let l = 0;
    for (const [k, s] of [[35633, 'void main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}'], [35632, F]]) {
      const o = g.createShader(k); g.shaderSource(o, H + s); g.compileShader(o); g.attachShader(P, o); }
    g.linkProgram(P); g.useProgram(P); let t = 0, run = 1; b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす';
    (function f(n) { requestAnimationFrame(f); t += run * (n - l) / 1e3; l = n; const w = innerWidth, h = innerHeight;
      if (c.width - w || c.height - h) c.width = w, c.height = h; g.viewport(0, 0, w, h);
      g.uniform3f(g.getUniformLocation(P, 'R'), w, h, t); g.drawArrays(4, 0, 3); })(0);
  },
}, {
  id: 'demo-20-menger', c: 'demo', lv: 3,
  t: '20行でメンガーのスポンジを飛ぶ', y: 'にじゅうぎょうでめんがーのすぽんじをとぶ',
  tags: ['20行', 'フラクタル', 'メンガーのスポンジ', 'レイマーチング', 'WebGL2'],
  d: '20 行のコードで、どこまでも入れ子になった立方体の迷宮（メンガーのスポンジ）の中を飛ぶ。立方体を 27 個に分けて、真ん中と面の中央の 7 個をくり抜く。これを 5 段くり返した形を、空間に敷き詰める。画面の点ごとに、形までの距離の分だけ進むことを繰り返して当たりを探す（レイマーチング）。進んだ回数で影を付け、遠い所は霧に溶かす。',
  p: '「くり抜いた十字の穴」は、座標を 3 倍しながら畳み込む計算 1 つで全部の段が表せる。形のデータは持たず、距離の式だけで無限の迷宮になる。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const F = `uniform vec3 R;out vec4 O;float M(vec3 p){p=mod(p+1.,2.)-1.;vec3 q=abs(p)-1.;
    float d=max(q.x,max(q.y,q.z)),s=1.;for(int i=0;i<5;i++){vec3 a=mod(p*s,2.)-1.;s*=3.;vec3 r=abs(1.-3.*abs(a));
    d=max(d,(min(max(r.x,r.y),min(max(r.y,r.z),max(r.z,r.x)))-1.)/s);}return d;}
    void main(){vec2 u=(gl_FragCoord.xy-.5*R.xy)/R.y;float a=R.z*.1;u*=mat2(cos(a),sin(a),-sin(a),cos(a));
    vec3 o=vec3(.02*sin(R.z*.3),.02*cos(R.z*.4),R.z*.25),d=normalize(vec3(u,1.)),p;float t=0.;int i;
    for(i=0;i<160;i++){p=o+d*t;float h=M(p);if(h<.0004*t||t>9.)break;t+=h;}vec2 e=vec2(.0005,0);
    vec3 n=normalize(vec3(M(p+e.xyy)-M(p-e.xyy),M(p+e.yxy)-M(p-e.yxy),M(p+e.yyx)-M(p-e.yyx)));
    vec3 c=(.5+.5*cos(vec3(0,1.2,2.4)+p.z*.8+R.z*.2))*(.35+.65*max(dot(n,normalize(vec3(.6,.8,-.3))),0.));
    c*=1.-float(i)/160.;O=vec4(pow(mix(c,vec3(.02,.01,.04),1.-exp(-t*.35)),vec3(.6)),1);}`;
    const g = c.getContext('webgl2'), P = g.createProgram(), H = '#version 300 es\nprecision highp float;'; let l = 0;
    for (const [k, s] of [[35633, 'void main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}'], [35632, F]]) {
      const o = g.createShader(k); g.shaderSource(o, H + s); g.compileShader(o); g.attachShader(P, o); }
    g.linkProgram(P); g.useProgram(P); let t = 0, run = 1; b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす';
    (function f(n) { requestAnimationFrame(f); t += run * (n - l) / 1e3; l = n; const w = innerWidth, h = innerHeight;
      if (c.width - w || c.height - h) c.width = w, c.height = h; g.viewport(0, 0, w, h);
      g.uniform3f(g.getUniformLocation(P, 'R'), w, h, t); g.drawArrays(4, 0, 3); })(0);
  },
}, {
  id: 'demo-20-hyperbolic', c: 'demo', lv: 3,
  t: '20行の双曲平面のタイル', y: 'にじゅうぎょうのそうきょくへいめんのたいる',
  tags: ['20行', '双曲幾何', 'ポアンカレの円板', '鏡映', 'WebGL2'],
  d: '20 行のコードで、双曲平面を 7 角形で敷き詰めた模様（{7,3} のタイル張り）を、ポアンカレの円板に描く。円板の中では、縁に近づくほど同じ大きさのタイルが小さく見え、縁までに無限個のタイルが並ぶ。画面の点ごとに、3 枚の鏡（2 本の直線と、縁に直交する円）で映し返すことを繰り返し、基本の三角形に戻るまでの回数の偶奇で色を塗る。円板の中を平行に移す変換（メビウス変換）で、模様がゆっくり流れる。',
  p: '普通の平面では、正 7 角形を 1 つの頂点に 3 つ集めると角が余る。双曲平面では、それがすき間なく敷き詰められる。鏡の円は「縁の円に直交し、7 角形の角が 120 度になる」大きさを 2 つの式で決める。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const F = `uniform vec3 R;out vec4 O;vec2 cm(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
    vec2 cd(vec2 a,vec2 b){return cm(a,vec2(b.x,-b.y))/dot(b,b);}
    void main(){vec2 z=(gl_FragCoord.xy-.5*R.xy)/R.y*2.1;float r2=dot(z,z);if(r2>1.){O=vec4(0,0,0,1);return;}
    vec2 w=.6*vec2(cos(R.z*.13),sin(R.z*.17));z=cd(z+w,vec2(1,0)+cm(vec2(w.x,-w.y),z));
    float A=3.14159/7.,B=3.14159/3.,X=1./sqrt(1.-pow(sin(A)/cos(B),2.)),Q=X*sin(A)/cos(B),k=0.;
    vec2 C=vec2(X,0),m=vec2(-sin(A),cos(A));for(int i=0;i<60;i++){bool f=false;
    if(z.y<0.){z.y=-z.y;k++;f=true;}float s=dot(z,m);if(s>0.){z-=2.*s*m;k++;f=true;}
    vec2 v=z-C;float l=dot(v,v);if(l<Q*Q){z=C+v*Q*Q/l;k++;f=true;}if(!f)break;}
    float e=min(min(abs(z.y),abs(dot(z,m))),abs(length(z-C)-Q))/(1.-r2)*30.,p=mod(k,2.);
    vec3 c=mix(vec3(.1,.15,.35),vec3(.95,.75,.35),p)*(1.-.6*r2)*smoothstep(0.,.6,e);O=vec4(pow(c,vec3(.8)),1);}`;
    const g = c.getContext('webgl2'), P = g.createProgram(), H = '#version 300 es\nprecision highp float;'; let l = 0;
    for (const [k, s] of [[35633, 'void main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}'], [35632, F]]) {
      const o = g.createShader(k); g.shaderSource(o, H + s); g.compileShader(o); g.attachShader(P, o); }
    g.linkProgram(P); g.useProgram(P); let t = 0, run = 1; b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす';
    (function f(n) { requestAnimationFrame(f); t += run * (n - l) / 1e3; l = n; const w = innerWidth, h = innerHeight;
      if (c.width - w || c.height - h) c.width = w, c.height = h; g.viewport(0, 0, w, h);
      g.uniform3f(g.getUniformLocation(P, 'R'), w, h, t); g.drawArrays(4, 0, 3); })(0);
  },
}, {
  id: 'demo-20-life', c: 'demo', lv: 3,
  t: '20行で400万セルのライフゲーム', y: 'にじゅうぎょうでよんひゃくまんせるのらいふげーむ',
  tags: ['20行', 'ライフゲーム', 'セル・オートマトン', 'GPU', 'WebGL2'],
  d: '20 行のコードで、2048 × 2048 ＝ 約 420 万個のセルのライフゲームを、毎コマ GPU で計算する。盤の状態を 2 枚の画像（テクスチャ）に持ち、片方を読んで次の世代をもう片方へ描く、を交互に繰り返す。生きているセルは白く、最近まで生きていた所は青く残る。画面は盤の全体から、1 セルが見える大きさまで、ゆっくり寄ったり引いたりする。',
  p: '「隣の 8 マスの生き残りを数える」計算を、画像の 1 画素ごとに GPU が同時に行う。セルの数を 4 倍にしても、コードは 1 文字も増えない。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const F = `uniform sampler2D T;uniform vec4 R;out vec4 O;float h(vec2 p){return fract(sin(dot(p,vec2(12.9,78.2)))*4e4);}
    void main(){ivec2 q=ivec2(gl_FragCoord);vec4 s=texelFetch(T,q,0);if(R.w<1.){O=vec4(step(.7,
    h(vec2(q)))*step(length(vec2(q)-1024.),300.));return;}if(R.w<2.){int n=0;for(int y=-1;y<2;y++)for(int x=-1;x<2;
    x++)n+=int(texelFetch(T,(q+ivec2(x,y)+2048)%2048,0).r);float a=s.r>.5?float(n==3||n==4):float(n==3);O=vec4(a,max(a,
    s.g*.985),0,1);return;}float z=mix(1.,R.y/4096.,.5+.5*cos(R.z*.15));vec4 v=texture(T,
    .5+(gl_FragCoord.xy-.5*R.xy)/R.y*z);O=vec4(pow(vec3(v.g),vec3(3,1.6,.7))*.9+v.r,1);}`;
    const g = c.getContext('webgl2'), P = g.createProgram(), H = '#version 300 es\nprecision highp float;'; let l = 0;
    for (const [k, s] of [[35633, 'void main(){gl_Position=vec4(gl_VertexID%2*4-1,gl_VertexID/2*4-1,0,1);}'], [35632, F]]) {
      const o = g.createShader(k); g.shaderSource(o, H + s); g.compileShader(o); g.attachShader(P, o); }
    g.linkProgram(P); g.useProgram(P); let t = 0, run = 1; b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす';
    const X = [0, 1].map(() => { const x = g.createTexture(), f = g.createFramebuffer(); g.bindTexture(3553, x);
      g.texStorage2D(3553, 1, g.RGBA8, 2048, 2048); g.texParameteri(3553, 10241, 9729); g.bindFramebuffer(36160, f);
      g.framebufferTexture2D(36160, 36064, 3553, x, 0); return [x, f]; });
    const D = (f, m, w, h) => { g.bindFramebuffer(36160, f); g.viewport(0, 0, w, h);
      g.uniform4f(g.getUniformLocation(P, 'R'), w, h, t, m); g.drawArrays(4, 0, 3); }; D(X[0][1], 0, 2048, 2048);
    (function f(n) { requestAnimationFrame(f); t += run * (n - l) / 1e3; l = n; const w = innerWidth, h = innerHeight;
      if (c.width - w || c.height - h) c.width = w, c.height = h; g.bindTexture(3553, X[0][0]);
      if (run) D(X[1][1], 1, 2048, 2048), X.reverse(), g.bindTexture(3553, X[0][0]); D(null, 2, w, h); })(0);
  },
}, {
  id: 'demo-20-galaxies', c: 'demo', lv: 3,
  t: '20行の銀河の衝突', y: 'にじゅうぎょうのぎんがのしょうとつ',
  tags: ['20行', '重力', '銀河', 'シミュレーション', 'Canvas'],
  d: '20 行のコードで、2 つの渦巻き銀河がすれ違って引きちぎられる様子を計算する。それぞれの銀河の中心に重い核を置き、核どうしは互いの重力で引き合って回る。12000 個の星は、両方の核の重力を受けて動く（星どうしの重力は省く）。最初は核のまわりを整然と回っていた星が、すれ違いの潮の力で長い尾と橋になる。視点はゆっくり回る。',
  p: '星どうしの重力を省くと、計算は「星の数 × 2」で済む。それでも、本物の銀河の衝突で見られる尾（潮汐の尾）がちゃんと現れる。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#000}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const x = c.getContext('2d'), R = Math.random, C = Math.cos, S2 = Math.sin; let K, S, T, run = 1;
    function init() { T = 0; K = [[-7, -2, 0, 0, .12, 0], [7, 2, 0, 0, -.12, 0]]; S = [];
      for (let i = 0; i < 12000; i++) { const k = i % 2, r = 1 + 5 * R() ** 1.4, a = R() * 6.28, v = (k ? 1 : -1) / r ** .5;
        const e = k * .9, p = K[k]; S.push([p[0] + C(a) * r, p[1] + S2(a) * r * C(e), S2(a) * r * S2(e),
          p[3] - S2(a) * v, p[4] + C(a) * v * C(e), C(a) * v * S2(e), k]); } }
    const pull = (s) => { for (const k of K) if (k !== s) { const X = k[0] - s[0], Y = k[1] - s[1], Z = k[2] - s[2];
      const q = .05 / (X * X + Y * Y + Z * Z + .1) ** 1.5; s[3] += X * q; s[4] += Y * q; s[5] += Z * q; } };
    const move = (s) => { s[0] += s[3] * .05; s[1] += s[4] * .05; s[2] += s[5] * .05; };
    b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす'; init();
    (function f() { requestAnimationFrame(f); const w = c.width = innerWidth, h = c.height = innerHeight, a = T * .003;
      for (let j = 0; run && j < 4; j++, T++) { K.forEach(pull); K.forEach(move); S.forEach((s) => (pull(s), move(s))); }
      x.globalCompositeOperation = 'lighter';
      for (const s of S) { const Z = 30 + s[0] * S2(a) + s[2] * C(a), q = h * 1.2 / Z, X = s[0] * C(a) - s[2] * S2(a);
        x.fillStyle = s[6] ? '#ffcf9a55' : '#9ccaff55'; x.fillRect(w / 2 + X * q, h / 2 - s[1] * q, 2, 2); }
      if (T > 6000) init(); })();
  },
}, {
  id: 'demo-20-penrose', c: 'demo', lv: 3,
  t: '20行のペンローズ・タイル', y: 'にじゅうぎょうのぺんろーずたいる',
  tags: ['20行', 'ペンローズ・タイル', '準周期', '黄金比', 'Canvas'],
  d: '20 行のコードで、どこまで広げても同じ並びがくり返さない模様（ペンローズ・タイル）を作る。10 枚の二等辺三角形の車輪から始め、1 枚を黄金比で 2〜3 枚に分けることを繰り返す。三角形を 2 枚ずつ組むと、太いひし形と細いひし形の 2 種類だけで平面が埋まる。世代が進むたびに模様が細かくなり、5 回対称の花が何重にも現れる。',
  p: '分け方の規則は「黄金比の点で切る」2 通りだけ。それだけで、周期を持たないのに秩序のある模様（準結晶と同じ性質）ができる。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: 'body{margin:0;background:#0b0d14}canvas{display:block;width:100vw;height:100vh}#b{position:fixed;left:8px;top:8px}',
  js() {
    const x = c.getContext('2d'), G = 2 / (1 + 5 ** .5), P = (k) => [Math.cos(k *= Math.PI / 10), Math.sin(k)];
    const L = (a, b) => [a[0] + (b[0] - a[0]) * G, a[1] + (b[1] - a[1]) * G]; let T = 0, run = 1;
    const gen = [Array.from({ length: 10 }, (_, i, s = i % 2 ? -1 : 1) => [0, [0, 0], P(2 * i + s), P(2 * i - s)])];
    for (let n = 1; n < 8; n++) gen[n] = gen[n - 1].flatMap(([k, A, B, C]) => k
      ? [[1, L(B, C), C, A], [1, L(B, A), L(B, C), B], [0, L(B, C), L(B, A), A]]
      : [[0, C, L(A, B), B], [1, L(A, B), C, A]]);
    const tri = (A, B, C) => { x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.lineTo(...C); };
    b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす';
    (function f() { requestAnimationFrame(f); const w = c.width = innerWidth, h = c.height = innerHeight;
      const s = Math.max(w, h) * .62; T = (T + run / 60) % 16; const n = Math.min(7, T / 1.6 | 0);
      x.translate(w / 2, h / 2); x.rotate(T * .05); x.scale(s, s);
      for (const [k, A, B, C] of gen[n]) { tri(A, B, C); x.fillStyle = k ? '#2d4b8c' : '#e2a33b'; x.fill(); }
      x.strokeStyle = '#0b0d14'; x.lineWidth = Math.max(.6, 3 - n * .35) / s; x.lineJoin = 'round';
      for (const [, A, B, C] of gen[n]) { tri(C, A, B); x.stroke(); } })();
  },
}, {
  id: 'demo-20-lightning', c: 'demo', lv: 2,
  t: '20行で育つ稲妻の樹', y: 'にじゅうぎょうでそだついなずまのき',
  tags: ['20行', 'DLA', 'フラクタル', 'ランダムウォーク', 'Canvas'],
  d: '20 行のコードで、でたらめに歩く粒が集まって稲妻のような枝が育つ様子を見せる（拡散律速凝集、DLA）。上の端から次々に粒を放ち、粒は上下左右へでたらめに歩く。歩いているうちに、すでに固まった枝の隣に来たら、そこで固まる。枝の先ほど粒に出会いやすいので、先へ先へと枝分かれして伸びる。固まった順に色を変えるので、育った順番が見える。',
  p: '「隣に来たら止まる」だけの規則から、雷の放電の跡（リヒテンベルク図形）や、霜・珊瑚・鉱物の結晶と同じ形が現れる。',
  html: '<canvas id=c></canvas><button id=b>止める</button>',
  css: `body{margin:0;background:#04030a}canvas{display:block;width:100vw;height:100vh;image-rendering:pixelated}
#b{position:fixed;left:8px;top:8px}`,
  js() {
    const W = 360, H = 240, x = c.getContext('2d'), img = x.createImageData(W, H), A = new Uint8Array(W * H);
    let run = 1, n, P, hi; const R = (m) => Math.random() * m | 0, S = Math.sin;
    const put = (i, v = n++ / 30) => { A[i] = 1; hi = Math.min(hi, i / W | 0);
      img.data.set([200 + 55 * S(v), 120 + 120 * S(v + 2), 255, 255], 4 * i); };
    function init() { A.fill(0); img.data.fill(0); n = 0; P = []; hi = H;
      for (let i = 0; i < W; i++) put((H - 1) * W + i); }
    b.onclick = () => b.textContent = (run ^= 1) ? '止める' : '動かす'; init(); c.width = W; c.height = H;
    (function f() { requestAnimationFrame(f); if (!run) return;
      while (P.length < 2000) P.push([R(W), Math.max(0, hi - 8 - R(12))]);
      for (let s = 0; s < 40; s++) for (const p of P) { if (p[2]) continue; const d = R(4);
        p[0] = (p[0] + [1, -1, 0, 0][d] + W) % W; p[1] = Math.max(0, Math.min(H - 2, p[1] + [0, 0, 1, -1][d]));
        const i = p[1] * W + p[0]; if (!(A[i + 1] | A[i - 1] | A[i + W] | A[i - W])) continue;
        put(i); p[2] = 1; if (hi < 3) return init(); }
      P = P.filter((p) => !p[2]); x.putImageData(img, 0, 0); })();
  },
}, {
  id: 'demo-20-bytebeat', c: 'demo', lv: 2,
  t: '20行のバイトビート（1行の式が音楽になる）', y: 'にじゅうぎょうのばいとびーと',
  tags: ['20行', 'バイトビート', '音楽', 'Web Audio', 'ビット演算'],
  d: '20 行のコードで、1 行の式から音楽を作る（バイトビート）。1 秒に 8000 回、時刻 t を式に入れ、答えの下 8 ビット（0〜255）をそのまま音の波の高さにする。シフト（>>）やかけ算・論理和（|）の組み合わせで、リズムと旋律のある曲が鳴る。式は書き換えられ、Enter で鳴らし直す。下には音の波を、1 列に 512 個ずつ並べた絵で描く。',
  p: '楽譜も音色のデータもない。t >> 13 のようなシフトがゆっくり変わる「拍」になり、それを掛けたり重ねたりすると旋律になる。',
  html: '<canvas id=c></canvas><button id=b>▶ 鳴らす</button><input id=e size=46 value="t*(t>>11&t>>8&123&t>>3)" aria-label="式">',
  css: `body{margin:0;background:#000;color:#fff}canvas{display:block;width:100vw;height:100vh}
#b,#e{position:fixed;top:8px;left:8px}#e{left:84px}`,
  js() {
    let A, src, D, start = 0; const x = c.getContext('2d');
    const make = () => { const F = new Function('t', `return (${e.value})&255`); D = new Float32Array(8000 * 32);
      for (let t = 0; t < D.length; t++) D[t] = (F(t) & 255) / 128 - 1; };
    function play() { src?.stop(); const buf = A.createBuffer(1, D.length, 8000); buf.copyToChannel(D, 0);
      src = A.createBufferSource(); src.buffer = buf; src.loop = true; const g = A.createGain(); g.gain.value = .25;
      src.connect(g).connect(A.destination); src.start(); start = A.currentTime; }
    b.onclick = () => { A ??= new AudioContext(); if (src) { src.stop(); src = null; b.textContent = '▶ 鳴らす'; return; }
      play(); b.textContent = '■ 止める'; }; make();
    e.onkeydown = (v) => { if (v.key === 'Enter') { make(); if (src) play(); } };
    (function f() { requestAnimationFrame(f); const w = c.width = innerWidth, h = c.height = innerHeight, cols = w + 2 >> 1;
      const img = x.createImageData(cols, 256), u = new Uint32Array(img.data.buffer);
      const now = (src ? (A.currentTime - start) * 8000 | 0 : cols * 512) + D.length * 9;
      for (let i = 0; i < cols; i++) for (let k = 0; k < 256; k++) {
        const v = (D[(now - (cols - i) * 512 + k * 2) % D.length] + 1) * 127 | 0;
        u[k * cols + i] = 255 << 24 | (255 - v / 2) << 16 | v << 8 | v * .4; }
      x.putImageData(img, 0, (h - 256) / 2); w && x.drawImage(c, 0, (h - 256) / 2, cols, 256, 0, 0, w, h); })();
  },
});
