var ABS=[], FMS=[];
var rV='', rO=false, rB=1, editId=null;
var pitchCount=3, epc=3;
var THRESHOLD=36;
var swingSortKey='pred', swingSortDir=-1;
var REG_MODEL=null;
// 表示用の状態（計算結果には影響しない）
var UI={statsPeriod:'all',cmpPeriod:'all',cmpMetric:'score',formSort:{key:'score',dir:-1},logLimit:30,logForm:'',SMALL_N:10,recMode:'balance'};
var CMP_CHART=null, SWING_CHART=null;

/* ============================================================
   計算部分（式は変更しない）
   ============================================================ */
function fmt(v){var n=parseFloat(v);if(isNaN(n))return'.000';var s=n.toFixed(3);return n<1&&n>-1?(n<0?'-'+Math.abs(n).toFixed(3).slice(1):s.slice(1)):s;}

function simAdvance(runners,bases,isBB){
  var r=runners.slice(),scored=0,rbi=0;
  if(bases===4){for(var i=0;i<3;i++){if(r[i]){scored++;rbi++;}}rbi++;scored++;return{newRunners:[false,false,false],scored:scored,rbi:rbi};}
  if(isBB){
    if(r[0]&&r[1]&&r[2]){scored++;return{newRunners:[true,true,true],scored:scored,rbi:0};}
    var nr2=r.slice();
    if(nr2[0]&&nr2[1]&&!nr2[2])nr2[2]=true;
    else if(nr2[0]&&!nr2[1])nr2[1]=true;
    nr2[0]=true;return{newRunners:nr2,scored:scored,rbi:0};
  }
  var nr=[false,false,false];
  for(var i=2;i>=0;i--){if(r[i]){var np=i+bases;if(np>=3){scored++;rbi++;}else nr[np]=true;}}
  var bp=bases-1;if(bp>=3){scored++;rbi++;}else nr[bp]=true;
  return{newRunners:nr,scored:scored,rbi:rbi};
}
function recalcRBI(list){
  var sorted=list.slice().sort(function(a,b){return a.id-b.id;});
  var simR=[false,false,false];
  var prevInning=null;
  for(var i=0;i<sorted.length;i++){
    var a=sorted[i];
    if(a.paNum===1 || a.inning!==prevInning) simR=[false,false,false];
    prevInning=a.inning;
    if(a.isOut){a.rbi=0;}
    else{var res=simAdvance(simR,a.bases,a.isBB);a.rbi=res.rbi;simR=res.newRunners;}
  }
  var idMap={};sorted.forEach(function(a){idMap[a.id]=a;});
  return list.map(function(a){return idMap[a.id]||a;});
}

function calcScoreAll(s){if(!s)return 0;return (s.obp*20)+(Math.min(s.avgP,10)/10*15)+(s.nonGoroRate*20)+(Math.min(s.slg,2)/2*45);}
function calcScoreBefore36(s){if(!s)return 0;return (s.obp*35)+(Math.min(s.avgP,10)/10*30)+(s.nonGoroRate*10)+(Math.min(s.slg,2)/2*25);}
function calcScoreAfter36(s){if(!s)return 0;return (s.obp*5)+(Math.min(s.avgP,10)/10*5)+(s.nonGoroRate*30)+(Math.min(s.slg,2)/2*60);}

(function(){
  var keys=['wii_final','wii_abs','wii_atbats_v3'];
  var best=[];
  for(var k=0;k<keys.length;k++){
    try{var d=JSON.parse(localStorage.getItem(keys[k])||'null');if(d&&d.length>best.length)best=d;}catch(e){}
  }
  ABS=recalcRBI(best);
  try{var sf=JSON.parse(localStorage.getItem('wii_final_f')||'null');if(sf&&sf.length)FMS=sf;}catch(e){}
  if(!FMS.length)FMS=['イチロー','ブライスハーパー','ニックカーツ','バース','大谷翔平'];
  saveA();
})();

function saveA(){try{localStorage.setItem('wii_final',JSON.stringify(ABS));}catch(e){}}
function saveF(){try{localStorage.setItem('wii_final_f',JSON.stringify(FMS));}catch(e){}}

function getCurrentRunners(targetInning,targetPaNum){
  var sorted=ABS.slice().sort(function(a,b){return a.id-b.id;});
  var simR=[false,false,false];
  var prevInning=null;
  for(var i=0;i<sorted.length;i++){
    var a=sorted[i];
    if(a.paNum===1 || a.inning!==prevInning) simR=[false,false,false];
    prevInning=a.inning;
    if(!a.isOut){var sr=simAdvance(simR,a.bases,a.isBB);simR=sr.newRunners;}
  }
  if(targetPaNum===1 || prevInning!==targetInning) simR=[false,false,false];
  return simR;
}

function calc(list){
  var n=list.length;if(!n)return null;
  var ob=list.filter(function(a){return a.isOnBase;}).length;
  var gr=list.filter(function(a){return a.isGoro;}).length;
  var li=list.filter(function(a){return a.isLiner;}).length;
  var tb=list.reduce(function(s,a){return s+(a.bases||0);},0);
  var ab=list.filter(function(a){return !a.isBB;}).length;
  var hits=list.filter(function(a){return a.isHit;}).length;
  var rbi=list.reduce(function(s,a){return s+(a.rbi||0);},0);
  var ap=list.reduce(function(s,a){return s+a.pitches;},0)/n;
  var games=list.filter(function(a){return a.paNum===1;}).length;
  return{n:n,ab:ab,hits:hits,rbi:rbi,rbiRate:n>0?rbi/n:0,avg:ab>0?hits/ab:0,
    obp:ob/n,nonGoroRate:1-(gr/n),linerRate:li/n,avgP:ap,slg:ab>0?tb/ab:0,games:games};
}

// ===== スイング3指標の生値を取得（回帰の説明変数） =====
function calcSwingRaw(list){
  var n=list.length; if(!n) return null;
  var deep=list.filter(function(a){return a.pitches>=5;}).length;
  var deepRate=deep/n;
  var quick=list.filter(function(a){return a.pitches<=4;});
  var quickHits=quick.filter(function(a){return a.isHit;}).length;
  var quickHitRate=quick.length>0?quickHits/quick.length:0;
  var timing=deepRate+quickHitRate;

  var ab=list.filter(function(a){return !a.isBB;}).length;
  var hits=list.filter(function(a){return a.isHit;}).length;
  var tb=list.reduce(function(s,a){return s+(a.bases||0);},0);
  var avg=ab>0?hits/ab:0;
  var slg=ab>0?tb/ab:0;
  var iso=slg-avg;

  var gr=list.filter(function(a){return a.isGoro;}).length;
  var nongoro=1-(gr/n);

  var s=calc(list);
  return{n:n,timing:timing,iso:iso,nongoro:nongoro,rbiRate:s.rbiRate,score:calcScoreAll(s),deepRate:deepRate,quickHitRate:quickHitRate,quickN:quick.length};
}

// ===== 重回帰分析（最小二乗法・ガウス消去法） =====
function solveLinearSystem(A,b){
  var n=4;
  var M=A.map(function(row,i){return row.slice().concat([b[i]]);});
  for(var i=0;i<n;i++){
    var maxRow=i;
    for(var k=i+1;k<n;k++){if(Math.abs(M[k][i])>Math.abs(M[maxRow][i]))maxRow=k;}
    var tmp=M[i];M[i]=M[maxRow];M[maxRow]=tmp;
    if(Math.abs(M[i][i])<1e-9)continue;
    for(var k=i+1;k<n;k++){
      var c=M[k][i]/M[i][i];
      for(var j=i;j<n+1;j++){M[k][j]-=c*M[i][j];}
    }
  }
  var x=new Array(n).fill(0);
  for(var i=n-1;i>=0;i--){
    var sum=M[i][n];
    for(var j=i+1;j<n;j++){sum-=M[i][j]*x[j];}
    x[i]=Math.abs(M[i][i])<1e-9?0:sum/M[i][i];
  }
  return x;
}

function toHensachiParams(values){
  var n=values.length;
  var mean=values.reduce(function(a,b){return a+b;},0)/n;
  var variance=values.reduce(function(s,v){return s+Math.pow(v-mean,2);},0)/n;
  var sd=Math.sqrt(variance);
  return{mean:mean,sd:sd};
}
function toHensachi(v,p){return p.sd>0?50+10*(v-p.mean)/p.sd:50;}

function computeRegressionModel(){
  var byF={};
  ABS.forEach(function(a){if(!byF[a.form])byF[a.form]=[];byF[a.form].push(a);});
  var rows=Object.keys(byF).map(function(f){
    var raw=calcSwingRaw(byF[f]);
    return raw && raw.n>=3 ? {form:f,timing:raw.timing,iso:raw.iso,nongoro:raw.nongoro,rbiRate:raw.rbiRate} : null;
  }).filter(function(x){return x;});

  if(rows.length<5) return null; // サンプル不足

  var pT=toHensachiParams(rows.map(function(r){return r.timing;}));
  var pI=toHensachiParams(rows.map(function(r){return r.iso;}));
  var pN=toHensachiParams(rows.map(function(r){return r.nongoro;}));

  var XtX=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  var Xty=[0,0,0,0];
  rows.forEach(function(r){
    var zt=toHensachi(r.timing,pT), zi=toHensachi(r.iso,pI), zn=toHensachi(r.nongoro,pN);
    var x=[1,zt,zi,zn];
    for(var i=0;i<4;i++){
      Xty[i]+=x[i]*r.rbiRate;
      for(var j=0;j<4;j++)XtX[i][j]+=x[i]*x[j];
    }
  });
  var coeffs=solveLinearSystem(XtX,Xty);

  var yMean=rows.reduce(function(s,r){return s+r.rbiRate;},0)/rows.length;
  var ssTot=0,ssRes=0;
  rows.forEach(function(r){
    var zt=toHensachi(r.timing,pT), zi=toHensachi(r.iso,pI), zn=toHensachi(r.nongoro,pN);
    var pred=coeffs[0]+coeffs[1]*zt+coeffs[2]*zi+coeffs[3]*zn;
    ssRes+=Math.pow(r.rbiRate-pred,2);
    ssTot+=Math.pow(r.rbiRate-yMean,2);
  });
  var r2=ssTot>0?1-(ssRes/ssTot):0;

  return{pT:pT,pI:pI,pN:pN,coeffs:coeffs,r2:r2,nForms:rows.length};
}

function predictRBI(model,timing,iso,nongoro){
  if(!model)return null;
  var zt=toHensachi(timing,model.pT), zi=toHensachi(iso,model.pI), zn=toHensachi(nongoro,model.pN);
  return model.coeffs[0]+model.coeffs[1]*zt+model.coeffs[2]*zi+model.coeffs[3]*zn;
}

function get36before(){
  var sorted=ABS.slice().sort(function(a,b){return a.id-b.id;});
  var cum=0,res=[];
  for(var i=0;i<sorted.length;i++){
    var a=sorted[i];if(a.paNum===1)cum=0;if(cum<THRESHOLD)res.push(a);cum+=a.pitches;
  }
  return res;
}
function get36after(){
  var sorted=ABS.slice().sort(function(a,b){return a.id-b.id;});
  var cum=0,res=[];
  for(var i=0;i<sorted.length;i++){
    var a=sorted[i];if(a.paNum===1)cum=0;
    if(cum>=THRESHOLD)res.push(a);
    cum+=a.pitches;
  }
  return res;
}
var noteAll='📐 <strong>全体スコア（長打率重視）</strong><br>出塁率×20点 ＋ 平均球数÷10×15点 ＋ 非ゴロ率×20点 ＋ 長打率÷2×45点';
var noteBefore='📐 <strong>36球以前スコア（出塁率・球数重視）</strong><br>出塁率×35点 ＋ 平均球数÷10×30点 ＋ 非ゴロ率×10点 ＋ 長打率÷2×25点';
var noteAfter='📐 <strong>36球以後スコア（長打率を圧倒的に重視）</strong><br>出塁率×5点 ＋ 平均球数÷10×5点 ＋ 非ゴロ率×30点 ＋ 長打率÷2×60点';

/* ============================================================
   表示用の小道具
   ============================================================ */
var PERIODS={
  all:{label:'全体',data:function(){return ABS;},score:calcScoreAll,note:noteAll,desc:'全打席が対象。長打率を最重視したスコア。'},
  before36:{label:'36球以前',data:get36before,score:calcScoreBefore36,note:noteBefore,desc:'ゲーム内の累計球数が36球未満の打席。出塁率・球数を重視。'},
  after36:{label:'36球以後',data:get36after,score:calcScoreAfter36,note:noteAfter,desc:'累計36球以後（投手が疲れた後）の打席。長打率を圧倒的に重視。'}
};
function $(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function groupByForm(data){var byF={};data.forEach(function(a){if(!byF[a.form])byF[a.form]=[];byF[a.form].push(a);});return byF;}
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
function accentA(a){return 'rgba('+cssVar('--accent-rgb')+','+a+')';}
function setSeg(id,v){var el=$(id);if(!el)return;el.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b.dataset.v===v);});}
function sgn(v){return (v>=0?'+':'')+fmt(v);}
function resCell(v){if(v===null)return '<td>—</td>';return '<td class="'+(v>=0?'pos-res':'neg-res')+'">'+sgn(v)+'</td>';}
function wrapTable(html){return '<div class="tbl-wrap">'+html+'</div>';}

// 列ごとに「上位ほど濃い」色をつける（打席数が少ないフォームは基準から外す）
function heatFn(rows,get,nOf){
  var base=rows.filter(function(r){return nOf(r)>=UI.SMALL_N;});if(base.length<2)base=rows;
  var vals=base.map(get).filter(function(v){return v!==null&&isFinite(v);});
  if(vals.length<2)return function(){return 0;};
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);
  return function(v){if(v===null||mx===mn)return 0;return Math.max(0,Math.min(1,(v-mn)/(mx-mn)));};
}
function hcell(txt,h,cls){return '<td class="heat'+(cls?' '+cls:'')+'" style="--h:'+h.toFixed(2)+'">'+txt+'</td>';}

function formStats(data,scoreFn,model){
  var byF=groupByForm(data);
  return Object.keys(byF).map(function(f){
    var fs=calc(byF[f]);
    var raw=calcSwingRaw(byF[f]);
    var pred=model&&raw?predictRBI(model,raw.timing,raw.iso,raw.nongoro):null;
    var residual=pred!==null?fs.rbiRate-pred:null;
    return{form:f,s:fs,score:scoreFn(fs),pred:pred,residual:residual};
  });
}

/* ============================================================
   ヘッダー
   ============================================================ */
function renderHeader(){
  var forms=Object.keys(groupByForm(ABS)).length;
  var games=ABS.filter(function(a){return a.paNum===1;}).length;
  $('hdr-kpi').innerHTML='<span><b>'+ABS.length+'</b>打席</span><span><b>'+games+'</b>ゲーム</span><span><b>'+forms+'</b>フォーム</span>';
}

/* ============================================================
   打席入力
   ============================================================ */
function selR(btn,val,isOut){
  // 四球をもう一度押したら解除
  if(val==='四球'&&rV==='四球'){resetResultBtns();return;}
  var isBB=val==='四球';
  document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('sel');b.disabled=isBB&&b!==btn;});
  btn.classList.add('sel');rV=val;rO=isOut;
  var lock=isOut||isBB;
  var bw=document.getElementById('base-btns');
  bw.style.opacity=lock?'0.3':'1';bw.style.pointerEvents=lock?'none':'';
  bw.querySelectorAll('.bb').forEach(function(b){b.disabled=lock;});
}
function resetResultBtns(){
  rV='';rO=false;
  document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('sel');b.disabled=false;});
  var bw=document.getElementById('base-btns');
  bw.style.opacity='1';bw.style.pointerEvents='';
  bw.querySelectorAll('.bb').forEach(function(b){b.disabled=false;});
}
function selB(btn,n){document.querySelectorAll('.bb').forEach(function(b){b.classList.remove('sel');});btn.classList.add('sel');rB=n;}
function setBN(n){document.querySelectorAll('.bb').forEach(function(b,i){b.classList.toggle('sel',i===n-1);});rB=n;}
function renderChips(){
  var el=document.getElementById('saved-forms'),cur=document.getElementById('form-name').value.trim();
  el.innerHTML=FMS.map(function(f){
    return '<button type="button" class="chip'+(f===cur?' sel':'')+'" data-f="'+esc(f)+'" onclick="pickF(this.dataset.f)">'+esc(f)+'</button>';
  }).join('');
}
function pickF(n){document.getElementById('form-name').value=n;renderChips();}
function clearFN(){document.getElementById('form-name').value='';renderChips();}
function clearR(){
  rB=1;pitchCount=3;
  resetResultBtns();
  setBN(1);
  setPitch(3);
}
function changePitch(d){pitchCount=Math.max(1,Math.min(15,pitchCount+d));document.getElementById('pitch-disp').textContent=pitchCount;}
function changeEP(d){epc=Math.max(1,Math.min(15,epc+d));document.getElementById('e-pitch-disp').textContent=epc;}
// 球数入力（記録画面・編集画面）：よく出る球数(出現率5%超)はスライダー、まれな球数は数字入力
var PITCH_RARE=0.05, PITCH_MAXIN=30, pitchSlideMax=5;
var PIN={main:{range:'pitch-range',num:'pitch-num',disp:'pitch-disp',ticks:'pitch-ticks',more:'pitch-more'},
         edit:{range:'e-pitch-range',num:'e-pitch-num',disp:'e-pitch-disp',ticks:'e-pitch-ticks',more:'e-pitch-more'}};
// スライダーの上限 = 1球から数えて、出現率が5%を超え続ける最大の球数（データが少ないうちは5）
function calcPitchSlideMax(){
  if(ABS.length<30)return 5;
  var cnt={};ABS.forEach(function(a){cnt[a.pitches]=(cnt[a.pitches]||0)+1;});
  var m=0;for(var k=1;k<=PITCH_MAXIN;k++){if((cnt[k]||0)/ABS.length>PITCH_RARE)m=k;else break;}
  return Math.max(3,Math.min(10,m));
}
function showPitch(which,v){
  var p=PIN[which],r=$(p.range),n=$(p.num);
  $(p.disp).textContent=v;
  var big=v>pitchSlideMax;
  if(r){r.max=pitchSlideMax;if(!big)r.value=v;r.classList.toggle('off',big);paintRange(r);}
  if(n){n.min=pitchSlideMax+1;if(!big&&document.activeElement!==n)n.value='';else if(big&&+n.value!==v&&document.activeElement!==n)n.value=v;n.parentNode.classList.toggle('on',big);}
}
function clampP(v){return Math.max(1,Math.min(PITCH_MAXIN,parseInt(v)||1));}
function setPitch(v){pitchCount=clampP(v);var n=$('pitch-num');if(n&&pitchCount<=pitchSlideMax)n.value='';showPitch('main',pitchCount);}
function setEP(v){epc=clampP(v);var n=$('e-pitch-num');if(n&&epc<=pitchSlideMax)n.value='';showPitch('edit',epc);}
function numPitch(which,val){
  var r=$(PIN[which].range);
  var v=val===''?(+r.value):clampP(val);
  if(which==='main')pitchCount=v;else epc=v;
  showPitch(which,v);
}
function paintRange(r){if(r)r.style.setProperty('--p',((r.value-r.min)/(r.max-r.min)*100)+'%');}
function updatePitchSlider(){
  pitchSlideMax=calcPitchSlideMax();
  ['main','edit'].forEach(function(w){
    var p=PIN[w],t=$(p.ticks),m=$(p.more);
    if(t){var h='';for(var i=1;i<=pitchSlideMax;i++)h+='<span style="--k:'+((i-1)/(pitchSlideMax-1))+'">'+i+'</span>';t.innerHTML=h;}
    if(m)m.textContent=(pitchSlideMax+1)+'球〜';
  });
  showPitch('main',pitchCount);showPitch('edit',epc);
}

function addAB(){
  var fn=document.getElementById('form-name').value.trim()||'（未設定）';
  var inn=document.getElementById('inning').value;
  var pan=parseInt(document.getElementById('pa-num').value)||1;
  if(!rV){alert('打席結果を選択してください');return;}
  var bases=rO?0:(rV==='四球'?0:rB);
  var isOut=rO,isBB=rV==='四球';
  var simR=getCurrentRunners(inn,pan);
  var rbi=0;
  if(!isOut){var res2=simAdvance(simR,bases,isBB);rbi=res2.rbi;}
  ABS.push({id:Date.now(),form:fn,inning:inn,result:rV,pitches:pitchCount,paNum:pan,bases:bases,rbi:rbi,
    isOut:isOut,isOnBase:!isOut,isGoro:rV.indexOf('ゴロ')===0,isLiner:rV.indexOf('ライナー')===0,
    isHit:!isOut&&!isBB,isBB:isBB});
  saveA();
  if(fn!=='（未設定）'&&FMS.indexOf(fn)<0){FMS.push(fn);saveF();}
  document.getElementById('pa-num').value=pan+1;
  // 3アウトで自動的に次の回へ（3回表で3アウトなら試合終了→次のゲームへ）
  if(isOut&&outsInInning(inn)>=3){
    var sel=document.getElementById('inning');
    if(sel.selectedIndex<sel.options.length-1){
      sel.selectedIndex++;
      flash('3アウト → '+sel.value+'へ');
    }else{
      sel.selectedIndex=0;document.getElementById('pa-num').value=1;
      flash('試合終了 → 次のゲーム（1回表・打席1）へ');
    }
  }
  clearR();
  refreshAfterChange();
}

// 画面下に数秒だけ出るお知らせ
function flash(m){
  var e=document.getElementById('flash');
  if(!e){e=document.createElement('div');e.id='flash';e.className='flash';e.setAttribute('role','status');document.body.appendChild(e);}
  e.textContent=m;e.classList.add('show');
  clearTimeout(flash._t);flash._t=setTimeout(function(){e.classList.remove('show');},2500);
}
// 今のゲームの、指定した回のアウト数（表示・回の自動送り用。成績の計算には使わない）
function outsInInning(inn){
  var sorted=ABS.slice().sort(function(a,b){return a.id-b.id;});
  var start=-1;
  for(var i=sorted.length-1;i>=0;i--){if(sorted[i].paNum===1){start=i;break;}}
  if(start<0)return 0;
  return sorted.slice(start).filter(function(a){return a.inning===inn&&a.isOut;}).length;
}

// 現在のゲーム状況（累計球数・走者）
function renderGameStatus(){
  var el=$('game-status');if(!el)return;
  var sorted=ABS.slice().sort(function(a,b){return a.id-b.id;});
  var cum=0,pa=0,games=0;
  sorted.forEach(function(a){if(a.paNum===1){cum=0;pa=0;games++;}cum+=a.pitches;pa++;});
  var nextPa=parseInt($('pa-num').value)||1;
  var isNew=nextPa===1||!sorted.length;
  var c=isNew?0:cum;
  var r=getCurrentRunners($('inning').value,nextPa);
  var title=isNew?'新しいゲーム（第'+(games+1)+'試合）':'第'+games+'試合 · '+pa+'打席消化';
  var after=c>=THRESHOLD;
  var sub=after?'累計 <b>'+c+'</b>球 → 次の打席は <b>36球以後</b>（投手疲労）':'累計 <b>'+c+'</b>球 → 36球まであと <b>'+(THRESHOLD-c)+'</b>球';
  var names=['一','二','三'],on=[];r.forEach(function(x,i){if(x)on.push(names[i]);});
  var runnerTxt=on.length?(on.length===3?'満塁':on.join('・')+'塁'):'走者なし';
  var outs=isNew?0:outsInInning($('inning').value);
  runnerTxt=$('inning').value+' '+outs+'アウト · '+runnerTxt;
  var svg='<svg width="46" height="46" viewBox="0 0 46 46" aria-label="走者: '+runnerTxt+'">'+
    '<rect class="base'+(r[1]?' on':'')+'" x="17" y="4" width="12" height="12" transform="rotate(45 23 10)"/>'+
    '<rect class="base'+(r[2]?' on':'')+'" x="3" y="18" width="12" height="12" transform="rotate(45 9 24)"/>'+
    '<rect class="base'+(r[0]?' on':'')+'" x="31" y="18" width="12" height="12" transform="rotate(45 37 24)"/>'+
    '<rect class="base home" x="18" y="33" width="10" height="10" transform="rotate(45 23 38)"/></svg>';
  el.innerHTML='<div class="gstat">'+svg+'<div class="gstat-body"><div class="gstat-t">'+title+' · '+runnerTxt+'</div>'+
    '<div class="gstat-s">'+sub+'</div><div class="pbar'+(after?' over':'')+'"><i style="width:'+Math.min(100,c/THRESHOLD*100)+'%"></i></div></div></div>';
  renderRecommend();
}

/* ============================================================
   次のゲームのおすすめ（表示専用。成績・スコア・重回帰の式には影響しない）
   1ゲーム=1フォームで運用しているので、ゲーム単位でおすすめする。
   優先度(100点) = ご無沙汰40 + データ不足30 + 有望度30（モードで重みを変える）
   ============================================================ */
var REC_WEIGHTS={
  balance:{r:40,l:30,p:30},
  recent:{r:80,l:10,p:10},
  lack:{r:10,l:80,p:10},
  promise:{r:10,l:10,p:80}
};
function setRecMode(m){UI.recMode=m;renderRecommend();}

function gameList(){
  // ABSをid順に並べ、paNum===1ごとにゲームを区切る（最初の打席がpaNum!==1でも1ゲームとして扱う）
  var sorted=ABS.slice().sort(function(a,b){return a.id-b.id;});
  var games=[],cur=null;
  sorted.forEach(function(a){if(a.paNum===1||!cur){cur={abs:[],forms:{}};games.push(cur);}cur.abs.push(a);cur.forms[a.form]=(cur.forms[a.form]||0)+1;});
  games.forEach(function(g){g.form=Object.keys(g.forms).sort(function(x,y){return g.forms[y]-g.forms[x];})[0];g.lastId=g.abs[g.abs.length-1].id;});
  return games;
}

function computeRecommendations(){
  var games=gameList(),G=games.length;
  var byF=groupByForm(ABS);
  var afterBy=groupByForm(get36after());
  var model=computeRegressionModel();
  var names=Object.keys(byF);
  FMS.forEach(function(f){if(names.indexOf(f)<0)names.push(f);});
  names=names.filter(function(f){return f!=='（未設定）';});
  var items=names.map(function(f){
    var list=byF[f]||[];
    var last=-1,ng=0,lastId=0;
    games.forEach(function(g,i){if(g.forms[f]){last=i;ng++;lastId=g.lastId;}});
    var s=list.length?calc(list):null;
    var raw=list.length?calcSwingRaw(list):null;
    var pred=model&&raw&&raw.n>=3?predictRBI(model,raw.timing,raw.iso,raw.nongoro):null;
    return{form:f,n:list.length,nAfter:(afterBy[f]||[]).length,games:ng,
      since:last<0?null:G-1-last,lastId:lastId,score:s?calcScoreAll(s):null,
      residual:pred!==null?s.rbiRate-pred:null};
  });
  var used=items.filter(function(x){return x.n>0;});
  function mm(arr){var v=arr.filter(function(x){return x!==null&&isFinite(x);});return v.length?{mn:Math.min.apply(null,v),mx:Math.max.apply(null,v)}:{mn:0,mx:0};}
  function nz(v,r){return r.mx>r.mn?(v-r.mn)/(r.mx-r.mn):0.5;}
  var rSince=mm(used.map(function(x){return x.since;}));
  var rInvN=mm(used.map(function(x){return 1/Math.sqrt(x.n);}));
  var rInvA=mm(used.map(function(x){return 1/Math.sqrt(x.nAfter+1);}));
  var rScore=mm(used.map(function(x){return x.score;}));
  var rRes=mm(used.map(function(x){return x.residual===null?null:-x.residual;}));
  var scoreRank={};used.slice().sort(function(a,b){return b.score-a.score;}).forEach(function(x,i){scoreRank[x.form]=i+1;});
  var W=REC_WEIGHTS[UI.recMode]||REC_WEIGHTS.balance;
  items.forEach(function(x){
    var rec,lack,prom;
    if(!x.n){rec=1;lack=1;prom=0.5;}
    else{
      rec=x.since===null?1:(rSince.mx>0?x.since/rSince.mx:0);
      lack=(nz(1/Math.sqrt(x.n),rInvN)+nz(1/Math.sqrt(x.nAfter+1),rInvA))/2;
      var ps=nz(x.score,rScore);
      prom=x.residual===null?ps:ps*0.7+nz(-x.residual,rRes)*0.3;
    }
    x.parts={r:rec*W.r,l:lack*W.l,p:prom*W.p};
    x.total=x.parts.r+x.parts.l+x.parts.p;
    x.rank=scoreRank[x.form]||null;
    // 理由
    var why=[];
    if(!x.n)why.push({c:'n',t:'まだ記録なし'});
    else{
      var cand=[];
      cand.push({k:rec*W.r,c:'r',t:x.since===0?'前のゲームで使用':x.since+'試合ぶり'});
      if(x.nAfter<UI.SMALL_N)cand.push({k:(lack+0.3)*W.l,c:'l',t:'36球以後が'+x.nAfter+'打席だけ'});
      else cand.push({k:lack*W.l,c:'l',t:'通算'+x.n+'打席・'+x.games+'試合'});
      if(x.residual!==null&&x.residual<-0.02)cand.push({k:(prom+0.2)*W.p,c:'p',t:'不運気味（乖離'+sgn(x.residual)+'）'});
      else if(x.rank&&x.rank<=3)cand.push({k:(prom+0.2)*W.p,c:'p',t:'スコア'+x.rank+'位'});
      else cand.push({k:prom*W.p,c:'p',t:'スコア'+x.score.toFixed(1)});
      cand.sort(function(a,b){return b.k-a.k;});
      why=cand.slice(0,2);
    }
    x.why=why;
  });
  items.sort(function(a,b){return b.total-a.total;});
  return{items:items,games:games};
}

function recRowHtml(x,i,canPick){
  var meta=x.n?'通算'+x.n+'打席 · '+x.games+'試合 · 最終 '+(x.since===0?'前のゲーム':x.since+'試合前')+(x.lastId?'（'+new Date(x.lastId).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'})+'）':''):'未記録のフォーム';
  var tot=x.total||1;
  return '<div class="rec'+(i===0?' first':'')+'">'+
    '<div class="rec-rank">'+(i+1)+'</div>'+
    '<div><div class="rec-name">'+esc(x.form)+'</div><div class="rec-meta">'+meta+'</div>'+
      '<div class="rec-why">'+x.why.map(function(w){return '<span class="why '+w.c+'">'+esc(w.t)+'</span>';}).join('')+'</div></div>'+
    '<div class="rec-side"><div><div class="rec-pt">'+Math.round(x.total)+'<small>点</small></div>'+
      '<div class="rec-bars" title="ご無沙汰 '+Math.round(x.parts.r)+' / データ不足 '+Math.round(x.parts.l)+' / 有望 '+Math.round(x.parts.p)+'">'+
      '<i class="br" style="width:'+(x.parts.r/tot*100)+'%"></i><i class="bl" style="width:'+(x.parts.l/tot*100)+'%"></i><i class="bp" style="width:'+(x.parts.p/tot*100)+'%"></i></div></div>'+
      (canPick?'<button type="button" class="btn'+(i===0?' btnp':'')+'" data-f="'+esc(x.form)+'" onclick="pickRec(this.dataset.f)">このフォームにする</button>':'')+
    '</div></div>';
}

function renderRecommend(){
  var listEl=$('rec-list');if(!listEl)return;
  setSeg('rec-mode',UI.recMode);
  var R=computeRecommendations(),items=R.items,games=R.games;
  var nextPa=parseInt($('pa-num').value)||1;
  var midGame=nextPa!==1&&games.length>0;
  var curForm=midGame?games[games.length-1].form:null;
  $('rec-sub').innerHTML=midGame?'いま第'+games.length+'試合（'+esc(curForm)+'）の途中です。次のゲームの候補：':'1ゲーム＝1フォーム。次のゲームで使うフォームの候補です。';
  if(!items.length){listEl.innerHTML='<p class="empty">フォームがまだありません</p>';return;}
  var top=items.slice(0,3),rest=items.slice(3);
  listEl.innerHTML='<div class="rec-list">'+top.map(function(x,i){return recRowHtml(x,i,!midGame);}).join('')+'</div>'+
    (rest.length?'<details class="rec-more"><summary>残り'+rest.length+'フォームの優先度を見る</summary><div class="rec-list" style="margin-top:8px;">'+
      rest.map(function(x,i){return recRowHtml(x,i+3,!midGame);}).join('')+'</div></details>':'')+
    '<div class="rec-legend">優先度＝<b style="color:var(--warn)">ご無沙汰</b>（最後に使ってからの試合数）＋<b style="color:var(--info)">データ不足</b>（通算・36球以後の打席が少ない）＋<b style="color:var(--good)">有望</b>（スコアが高い・予測より不運）。配分：'+
      (function(w){return w.r+' / '+w.l+' / '+w.p;})(REC_WEIGHTS[UI.recMode])+'点。おすすめ用の目安で、成績・スコアの計算には影響しません。</div>';
}
function pickRec(f){pickF(f);var el=$('form-name');if(el&&el.scrollIntoView)el.scrollIntoView({behavior:'smooth',block:'center'});}

function mkB(a){
  var isHR=a.bases===4&&!a.isOut;
  var cls=isHR?'bhr':a.isBB?'bbb':a.isOut?'bo':'bh';
  var nm=['','一','二','三','本'];
  var lbl=(a.bases>=2&&!a.isOut&&!a.isBB)?a.result+'('+nm[a.bases]+'打)':a.result;
  return '<span class="badge '+cls+'">'+lbl+'</span>';
}
function renderRecent(){
  var el=document.getElementById('recent-log'),r=ABS.slice().reverse().slice(0,5);
  if(!r.length){el.innerHTML='<p class="empty">まだデータがありません</p>';return;}
  el.innerHTML=wrapTable('<table class="ltab"><thead><tr><th>回</th><th class="l">フォーム</th><th class="l">結果</th><th>球</th><th>打点</th></tr></thead><tbody>'+
    r.map(function(a){return '<tr><td>'+a.inning+'</td><td class="l form-cell">'+esc(a.form)+'</td><td class="l">'+mkB(a)+'</td><td>'+a.pitches+'</td><td>'+(a.rbi||0)+'</td></tr>';}).join('')+'</tbody></table>');
}

/* ============================================================
   成績一覧
   ============================================================ */
function regressionNoteHtml(model){
  if(!model){
    return '<div class="note note-reg">⚠ 重回帰分析には打席数3以上のフォームが5つ以上必要です。データが増えると自動的に計算されます。</div>';
  }
  var c=model.coeffs;
  var mx=Math.max(Math.abs(c[1]),Math.abs(c[2]),Math.abs(c[3]))||1;
  function bar(v,l){return '<span>'+l+'</span><span class="bar"><i class="'+(v<0?'neg':'')+'" style="width:'+(Math.abs(v)/mx*100).toFixed(0)+'%"></i></span><b>'+v.toFixed(4)+'</b>';}
  return '<div class="note note-reg">'+
    '<div class="note-t">📈 重回帰分析モデル <span class="sub">対象'+model.nForms+'フォーム · 決定係数 R²='+model.r2.toFixed(3)+'</span></div>'+
    '<div class="formula">予測打点率 = '+c[0].toFixed(4)+' + '+c[1].toFixed(4)+'×z(①タイミング) + '+c[2].toFixed(4)+'×z(②スピード) + '+c[3].toFixed(4)+'×z(③アングル)</div>'+
    '<div class="coef">'+bar(c[1],'①タイミング')+bar(c[2],'②スピード')+bar(c[3],'③アングル')+'</div>'+
    '<div class="sub">z(...)は各指標を偏差値化（平均50・標準偏差10）した値。係数（棒）が大きいほど打点率への影響が強い。</div>'+
    '</div>';
}

function renderPeriodSummary(){
  var el=$('period-summary');
  if(!ABS.length){el.innerHTML='<p class="empty">データなし</p>';return;}
  var rows=['all','before36','after36'].map(function(p){return{p:p,P:PERIODS[p],s:calc(PERIODS[p].data())};});
  el.innerHTML=wrapTable('<table class="ltab"><thead><tr><th>区分</th><th>打席</th><th>ゲーム</th><th>打率</th><th>出塁率</th><th>長打率</th><th>打点率</th><th>平均球数</th><th>非ゴロ率</th><th>スコア</th></tr></thead><tbody>'+
    rows.map(function(r){
      var s=r.s,cur=r.p===UI.statsPeriod?' cur':'';
      if(!s)return '<tr class="pick'+cur+'" onclick="setStatsPeriod(\''+r.p+'\')"><td>'+r.P.label+'</td><td colspan="9" class="c hint">データなし</td></tr>';
      return '<tr class="pick'+cur+'" onclick="setStatsPeriod(\''+r.p+'\')"><td>'+r.P.label+'</td><td>'+s.n+'</td><td>'+(r.p==='after36'?'—':s.games)+'</td><td>'+fmt(s.avg)+'</td><td>'+fmt(s.obp)+'</td><td>'+fmt(s.slg)+'</td><td>'+fmt(s.rbiRate)+'</td><td>'+s.avgP.toFixed(1)+'</td><td>'+fmt(s.nonGoroRate)+'</td><td class="num-strong">'+r.P.score(s).toFixed(1)+'</td></tr>';
    }).join('')+'</tbody></table>');
}

var FCOL={
  form:function(r){return r.form;},n:function(r){return r.s.n;},games:function(r){return r.s.games;},
  avg:function(r){return r.s.avg;},obp:function(r){return r.s.obp;},slg:function(r){return r.s.slg;},
  rbiRate:function(r){return r.s.rbiRate;},avgP:function(r){return r.s.avgP;},nonGoroRate:function(r){return r.s.nonGoroRate;},
  score:function(r){return r.score;},pred:function(r){return r.pred;},residual:function(r){return r.residual;}
};
function sortRows(rows,key,dir){
  var g=FCOL[key];
  return rows.slice().sort(function(a,b){
    var av=g(a),bv=g(b);
    if(av===null&&bv===null)return 0;if(av===null)return 1;if(bv===null)return -1;
    if(typeof av==='string')return av.localeCompare(bv,'ja')*(dir===-1?1:-1);
    return (bv-av)*(dir===-1?1:-1);
  });
}
function sortForm(key){
  if(UI.formSort.key===key)UI.formSort.dir*=-1;else UI.formSort={key:key,dir:-1};
  renderFormTable();
}
function renderFormTable(){
  var P=PERIODS[UI.statsPeriod];
  var rows=formStats(P.data(),P.score,REG_MODEL);
  var el=$('form-table');
  if(!rows.length){el.innerHTML='<div class="score-note">'+P.note+'</div><p class="empty">データなし</p>';return;}
  var topForm=sortRows(rows,'score',-1)[0].form;
  var sorted=sortRows(rows,UI.formSort.key,UI.formSort.dir);
  var nOf=function(r){return r.s.n;};
  var H={};['avg','obp','slg','rbiRate','avgP','nonGoroRate','score','pred'].forEach(function(k){H[k]=heatFn(rows,FCOL[k],nOf);});
  function th(key,label){var on=UI.formSort.key===key;return '<th class="sortable'+(on?' sorted':'')+'" onclick="sortForm(\''+key+'\')">'+label+(on?(UI.formSort.dir===-1?' ▼':' ▲'):'')+'</th>';}
  var body=sorted.map(function(r){
    var s=r.s,small=s.n<UI.SMALL_N,top=r.form===topForm;
    return '<tr class="'+(top?'top':'')+(small?' small':'')+'"><td class="form-cell">'+(top?'🥇 ':'')+esc(r.form)+(small?'<span class="tag">参考</span>':'')+'</td>'+
      '<td>'+s.n+'</td><td>'+(UI.statsPeriod==='after36'?'—':s.games)+'</td>'+
      hcell(fmt(s.avg),H.avg(s.avg))+hcell(fmt(s.obp),H.obp(s.obp))+hcell(fmt(s.slg),H.slg(s.slg))+hcell(fmt(s.rbiRate),H.rbiRate(s.rbiRate))+
      hcell(s.avgP.toFixed(1),H.avgP(s.avgP))+hcell(fmt(s.nonGoroRate),H.nonGoroRate(s.nonGoroRate))+
      hcell(r.score.toFixed(1),H.score(r.score),'num-strong')+
      (r.pred!==null?hcell(fmt(r.pred),H.pred(r.pred)):'<td>—</td>')+resCell(r.residual)+'</tr>';
  }).join('');
  el.innerHTML='<div class="score-note">'+P.note+'</div>'+wrapTable('<table class="ltab"><thead><tr>'+
    th('form','フォーム')+th('n','打席')+th('games','ゲーム')+th('avg','打率')+th('obp','出塁率')+th('slg','長打率')+th('rbiRate','打点率')+
    th('avgP','平均<br>球数')+th('nonGoroRate','非ゴロ率')+th('score','スコア')+th('pred','新スコア<br><span class="hint">予測打点率</span>')+th('residual','乖離')+
    '</tr></thead><tbody>'+body+'</tbody></table>')+
    '<div class="tbl-foot"><span>色が濃いほど上位 · 見出しタップで並び替え · 打席数'+UI.SMALL_N+'未満は「参考」</span></div>';
}

function setStatsPeriod(p){UI.statsPeriod=p;setSeg('stats-period',p);renderPeriodSummary();renderFormTable();}

function renderLog(){
  var el=$('full-log'),sel=$('log-form');
  var byF=groupByForm(ABS);
  var forms=Object.keys(byF).sort(function(a,b){return byF[b].length-byF[a].length;});
  if(UI.logForm&&!byF[UI.logForm])UI.logForm='';
  sel.innerHTML='<option value="">すべてのフォーム</option>'+forms.map(function(f){return '<option value="'+esc(f)+'">'+esc(f)+'（'+byF[f].length+'）</option>';}).join('');
  sel.value=UI.logForm;
  if(!ABS.length){el.innerHTML='<p class="empty">データなし</p>';return;}
  var list=[];
  for(var i=ABS.length-1;i>=0;i--){var a=ABS[i];if(!UI.logForm||a.form===UI.logForm)list.push({a:a,no:i+1});}
  var shown=list.slice(0,UI.logLimit);
  var rows=shown.map(function(x){
    var a=x.a;
    var paDisp=a.paNum===1?'<span class="pa-highlight">'+a.paNum+'</span>':a.paNum;
    return '<tr><td class="rank">'+x.no+'</td><td>'+a.inning+'</td><td class="l form-cell">'+esc(a.form)+'</td><td class="l">'+mkB(a)+'</td>'+
      '<td>'+paDisp+'</td><td>'+a.pitches+'球</td><td>'+(a.rbi||0)+'</td>'+
      '<td><button type="button" class="mini" onclick="window.WII_EDIT('+a.id+')">編集</button><button type="button" class="mini del" onclick="window.WII_DEL('+a.id+')">削除</button></td></tr>';
  }).join('');
  el.innerHTML=wrapTable('<table class="ltab"><thead><tr><th>#</th><th>回</th><th class="l">フォーム</th><th class="l">結果</th><th>通算</th><th>球</th><th>打点</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>')+
    '<div class="tbl-foot"><span>'+list.length+'件中 '+shown.length+'件を表示</span>'+
    (list.length>shown.length?'<button type="button" class="btn" onclick="moreLog()">さらに30件表示</button>':'')+'</div>';
}
function moreLog(){UI.logLimit+=30;renderLog();}
function setLogForm(v){UI.logForm=v;UI.logLimit=30;renderLog();}

function renderStats(){
  REG_MODEL=computeRegressionModel();
  document.getElementById('reg-note-stats').innerHTML=regressionNoteHtml(REG_MODEL);
  setSeg('stats-period',UI.statsPeriod);
  renderPeriodSummary();
  renderFormTable();
  renderLog();
}

/* ============================================================
   フォーム比較
   ============================================================ */
var METRICS={
  score:{label:'スコア',get:function(r){return r.score;},f:function(v){return v.toFixed(1);}},
  obp:{label:'出塁率',get:function(r){return r.s.obp;},f:fmt},
  slg:{label:'長打率',get:function(r){return r.s.slg;},f:fmt},
  nonGoroRate:{label:'非ゴロ率',get:function(r){return r.s.nonGoroRate;},f:fmt},
  avgP:{label:'平均球数',get:function(r){return r.s.avgP;},f:function(v){return v.toFixed(1);}},
  rbiRate:{label:'打点率',get:function(r){return r.s.rbiRate;},f:fmt},
  avg:{label:'打率',get:function(r){return r.s.avg;},f:fmt}
};
function setCmpPeriod(p){UI.cmpPeriod=p;renderCompare();}
function setCmpMetric(m){UI.cmpMetric=m;renderCompare();}

// 棒の右端に値を書くプラグイン（グラフごとに作る）
function valueLabelPlugin(texts){
  return{id:'valueLabels',afterDatasetsDraw:function(chart){
    var c=chart.ctx,meta=chart.getDatasetMeta(0);
    c.save();c.font='600 11px -apple-system,system-ui,sans-serif';c.fillStyle=cssVar('--muted');c.textBaseline='middle';
    meta.data.forEach(function(bar,i){c.fillText(texts[i],bar.x+5,bar.y);});c.restore();
  }};
}

function renderCompare(){
  setSeg('cmp-period',UI.cmpPeriod);setSeg('cmp-metric',UI.cmpMetric);
  var P=PERIODS[UI.cmpPeriod],M=METRICS[UI.cmpMetric];
  $('cmp-desc').textContent=P.desc;
  var rows=formStats(P.data(),P.score,null).filter(function(r){return r.s.n>=2;});
  var rEl=$('form-ranking'),wrap=$('cmp-wrap');
  if(CMP_CHART){CMP_CHART.destroy();CMP_CHART=null;}
  if(!rows.length){
    wrap.style.display='none';
    rEl.innerHTML='<p class="empty">2打席以上のフォームがありません</p>';
    return;
  }
  wrap.style.display='';
  var byM=rows.slice().sort(function(a,b){return M.get(b)-M.get(a);});
  wrap.style.height=Math.max(180,byM.length*30+40)+'px';
  var vals=byM.map(M.get);
  CMP_CHART=new Chart($('cmpChart').getContext('2d'),{
    type:'bar',
    data:{labels:byM.map(function(r){return r.form;}),datasets:[{label:M.label,data:vals,
      backgroundColor:byM.map(function(r,i){return i===0?cssVar('--accent'):r.s.n<UI.SMALL_N?accentA(.18):accentA(.5);}),
      borderRadius:5,barPercentage:.78,categoryPercentage:.9}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:250},
      layout:{padding:{right:44}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){var r=byM[ctx.dataIndex];return M.label+': '+M.f(ctx.raw)+'（'+r.s.n+'打席）';}}}},
      scales:{x:{beginAtZero:true,grid:{color:cssVar('--border')},border:{display:false},ticks:{color:cssVar('--faint'),font:{size:10},callback:function(v){return UI.cmpMetric==='score'||UI.cmpMetric==='avgP'?v:fmt(v);}}},
              y:{grid:{display:false},border:{display:false},ticks:{color:cssVar('--text'),font:{size:12,weight:'600'}}}}},
    plugins:[valueLabelPlugin(vals.map(M.f))]
  });

  var scored=rows.slice().sort(function(a,b){return b.score-a.score;});
  var nOf=function(r){return r.s.n;};
  var H={};['score','obp','slg','avgP','nonGoroRate','rbiRate'].forEach(function(k){H[k]=heatFn(rows,FCOL[k],nOf);});
  rEl.innerHTML='<div class="score-note">'+P.note+'</div>'+wrapTable('<table class="ltab"><thead><tr><th>フォーム</th><th>順位</th><th>打席</th><th>ゲーム</th><th>スコア</th><th>出塁率</th><th>長打率</th><th>平均球数</th><th>非ゴロ率</th><th>打点率</th></tr></thead><tbody>'+
    scored.map(function(r,i){
      var s=r.s,small=s.n<UI.SMALL_N;
      return '<tr class="'+(i===0?'top':'')+(small?' small':'')+'"><td class="form-cell">'+(i===0?'🥇 ':'')+esc(r.form)+(small?'<span class="tag">参考</span>':'')+'</td>'+
        '<td class="rank">'+(i+1)+'</td><td>'+s.n+'</td><td>'+(UI.cmpPeriod==='after36'?'—':s.games)+'</td>'+
        hcell(r.score.toFixed(1),H.score(r.score),'num-strong')+hcell(fmt(s.obp),H.obp(s.obp))+hcell(fmt(s.slg),H.slg(s.slg))+
        hcell(s.avgP.toFixed(1),H.avgP(s.avgP))+hcell(fmt(s.nonGoroRate),H.nonGoroRate(s.nonGoroRate))+hcell(fmt(s.rbiRate),H.rbiRate(s.rbiRate))+'</tr>';
    }).join('')+'</tbody></table>');
}

/* ============================================================
   スイング理論
   ============================================================ */
// 点の横にフォーム名を書く。重なる名前は省略（優先度の高い順に配置。省略分はタップで確認）
function pointLabelPlugin(texts,priority){
  return{id:'pointLabels',afterDatasetsDraw:function(chart){
    var c=chart.ctx,meta=chart.getDatasetMeta(1),area=chart.chartArea,placed=[];
    c.save();c.font='11px -apple-system,system-ui,sans-serif';c.fillStyle=cssVar('--muted');c.textBaseline='middle';
    var order=texts.map(function(_,i){return i;}).sort(function(a,b){return priority[b]-priority[a];});
    // 点そのものも障害物として登録
    meta.data.forEach(function(pt){placed.push({x1:pt.x-5,x2:pt.x+5,y1:pt.y-5,y2:pt.y+5});});
    order.forEach(function(i){
      var pt=meta.data[i];if(!pt)return;
      var t=texts[i],w=c.measureText(t).width,h=13;
      var cands=[[pt.x+8,pt.y],[pt.x-8-w,pt.y],[pt.x-w/2,pt.y-13],[pt.x-w/2,pt.y+13]];
      for(var k=0;k<cands.length;k++){
        var x=cands[k][0],y=cands[k][1];
        var r={x1:x-1,x2:x+w+1,y1:y-h/2,y2:y+h/2};
        if(r.x1<area.left||r.x2>area.right||r.y1<area.top||r.y2>area.bottom)continue;
        var self={x1:pt.x-5,x2:pt.x+5,y1:pt.y-5,y2:pt.y+5};
        var others=placed.filter(function(p){return !(p.x1===self.x1&&p.y1===self.y1);});
        if(others.some(function(p){return r.x1<p.x2&&r.x2>p.x1&&r.y1<p.y2&&r.y2>p.y1;}))continue;
        c.fillText(t,x,y);placed.push(r);break;
      }
    });c.restore();
  }};
}

function renderSwing(){
  REG_MODEL=computeRegressionModel();
  document.getElementById('reg-note-swing').innerHTML=regressionNoteHtml(REG_MODEL);

  var byF=groupByForm(ABS);
  var forms=Object.keys(byF).map(function(f){
    var raw=calcSwingRaw(byF[f]);
    if(!raw)return null;
    var pred=REG_MODEL?predictRBI(REG_MODEL,raw.timing,raw.iso,raw.nongoro):null;
    var residual=pred!==null?raw.rbiRate-pred:null;
    return{form:f,raw:raw,pred:pred,residual:residual};
  }).filter(function(item){return item && item.raw.n>=3;});

  forms.sort(function(a,b){
    var av = swingSortKey==='pred'?(a.pred||-999) : swingSortKey==='residual'?(a.residual||-999) : a.raw[swingSortKey];
    var bv = swingSortKey==='pred'?(b.pred||-999) : swingSortKey==='residual'?(b.residual||-999) : b.raw[swingSortKey];
    return (bv-av)*swingSortDir*-1;
  });

  // 散布図（予測 vs 実際）
  if(SWING_CHART){SWING_CHART.destroy();SWING_CHART=null;}
  var withPred=forms.filter(function(f){return f.pred!==null;});
  $('swing-chart-card').style.display=withPred.length?'':'none';
  if(withPred.length){
    var xs=withPred.map(function(f){return f.pred;}),ys=withPred.map(function(f){return f.raw.rbiRate;});
    var lo=Math.min.apply(null,xs.concat(ys)),hi=Math.max.apply(null,xs.concat(ys));
    var pad=(hi-lo)*0.08||0.05;lo=Math.max(0,Math.floor((lo-pad)*20)/20);hi=Math.ceil((hi+pad)*20)/20;
    SWING_CHART=new Chart($('swingChart').getContext('2d'),{
      type:'scatter',
      data:{datasets:[
        {type:'line',data:[{x:lo,y:lo},{x:hi,y:hi}],borderColor:cssVar('--faint'),borderDash:[5,4],borderWidth:1,pointRadius:0,pointHitRadius:0},
        {data:withPred.map(function(f){return{x:f.pred,y:f.raw.rbiRate};}),
         backgroundColor:withPred.map(function(f){return f.residual>=0?cssVar('--good'):cssVar('--bad');}),
         pointRadius:withPred.map(function(f){return Math.max(4,Math.min(9,Math.sqrt(f.raw.n)));}),pointHoverRadius:9}
      ]},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:250},
        plugins:{legend:{display:false},tooltip:{filter:function(i){return i.datasetIndex===1;},callbacks:{label:function(ctx){var f=withPred[ctx.dataIndex];return f.form+'：実際'+fmt(f.raw.rbiRate)+' / 予測'+fmt(f.pred)+'（乖離'+sgn(f.residual)+'・'+f.raw.n+'打席）';}}}},
        scales:{x:{min:lo,max:hi,title:{display:true,text:'予測打点率（新スコア）',color:cssVar('--muted')},grid:{color:cssVar('--border')},ticks:{color:cssVar('--faint'),callback:function(v){return fmt(v);}}},
                y:{min:lo,max:hi,title:{display:true,text:'実際の打点率',color:cssVar('--muted')},grid:{color:cssVar('--border')},ticks:{color:cssVar('--faint'),callback:function(v){return fmt(v);}}}}},
      plugins:[pointLabelPlugin(withPred.map(function(f){return f.form;}),withPred.map(function(f){return Math.abs(f.residual);}))]
    });
  }

  var arrow=function(key){return swingSortKey===key ? (swingSortDir===-1?' ▼':' ▲') : '';};
  var cls=function(key){return 'sortable'+(swingSortKey===key?' sorted':'');};
  var nOf=function(r){return r.raw.n;};
  var H={
    timing:heatFn(forms,function(r){return r.raw.timing;},nOf),iso:heatFn(forms,function(r){return r.raw.iso;},nOf),
    nongoro:heatFn(forms,function(r){return r.raw.nongoro;},nOf),rbi:heatFn(forms,function(r){return r.raw.rbiRate;},nOf),
    pred:heatFn(forms,function(r){return r.pred;},nOf)
  };

  var rows=forms.map(function(item){
    var f=item.form, raw=item.raw, small=raw.n<UI.SMALL_N;
    return '<tr class="'+(small?'small':'')+'">'+
      '<td class="form-cell">'+esc(f)+(small?'<span class="tag">参考</span>':'')+'</td>'+
      '<td>'+raw.n+'</td>'+
      hcell(raw.timing.toFixed(3),H.timing(raw.timing))+
      hcell(fmt(raw.iso),H.iso(raw.iso))+
      hcell(fmt(raw.nongoro),H.nongoro(raw.nongoro))+
      hcell(fmt(raw.rbiRate),H.rbi(raw.rbiRate))+
      (item.pred!==null?hcell(fmt(item.pred),H.pred(item.pred),'num-strong'):'<td>—</td>')+
      resCell(item.residual)+
      '</tr>';
  }).join('');

  document.getElementById('swing-table').innerHTML=wrapTable(
    '<table class="ltab"><thead><tr>'+
    '<th>フォーム</th><th>打席</th>'+
    '<th class="'+cls('timing')+'" onclick="sortSwing(\'timing\')">①タイミング'+arrow('timing')+'</th>'+
    '<th class="'+cls('iso')+'" onclick="sortSwing(\'iso\')">②スピード'+arrow('iso')+'</th>'+
    '<th class="'+cls('nongoro')+'" onclick="sortSwing(\'nongoro\')">③アングル'+arrow('nongoro')+'</th>'+
    '<th>実際の<br>打点率</th>'+
    '<th class="'+cls('pred')+'" onclick="sortSwing(\'pred\')">④新スコア<br><span class="hint">予測打点率</span>'+arrow('pred')+'</th>'+
    '<th class="'+cls('residual')+'" onclick="sortSwing(\'residual\')">乖離<br><span class="hint">実際−予測</span>'+arrow('residual')+'</th>'+
    '</tr></thead><tbody>'+
    (rows||'<tr><td colspan="8" class="c hint">3打席以上のフォームがありません</td></tr>')+
    '</tbody></table>')+
    '<div class="tbl-foot"><span>💡乖離がプラスのフォームは実力以上の結果、マイナスは「タイミング・スピード・アングルは優秀だが結果が出ていない＝不運だがポテンシャルが高い」フォームです。</span></div>';
}

window.sortSwing=function(key){
  if(swingSortKey===key){swingSortDir=swingSortDir===-1?1:-1;}
  else{swingSortKey=key;swingSortDir=-1;}
  renderSwing();
};

/* ============================================================
   編集・削除
   ============================================================ */
window.WII_DEL=function(id){
  var numId=parseInt(id,10);
  if(!window.confirm('削除しますか？'))return;
  if(window.SYNC)SYNC.markDeleted(numId); // 他の端末で復活しないよう記録
  ABS=ABS.filter(function(x){return x.id!==numId;});
  ABS=recalcRBI(ABS);
  saveA();refreshAfterChange();
};
window.WII_EDIT=function(id){
  var numId=parseInt(id,10);
  var a=null;for(var i=0;i<ABS.length;i++){if(ABS[i].id===numId){a=ABS[i];break;}}
  if(!a)return;editId=numId;
  var inn=document.getElementById('e-inning');
  for(var i=0;i<inn.options.length;i++){if(inn.options[i].value===a.inning)inn.selectedIndex=i;}
  document.getElementById('e-form').value=a.form;
  var res=document.getElementById('e-result');
  for(var i=0;i<res.options.length;i++){if(res.options[i].value===a.result)res.selectedIndex=i;}
  document.getElementById('e-bases').value=String(a.bases||0);
  setEP(a.pitches||3);
  document.getElementById('e-panum').value=a.paNum||1;
  document.getElementById('edit-modal').style.display='flex';
};
function closeModal(){document.getElementById('edit-modal').style.display='none';}
function saveEdit(){
  var idx=-1;for(var i=0;i<ABS.length;i++){if(ABS[i].id===editId){idx=i;break;}}
  if(idx<0)return;
  var result=document.getElementById('e-result').value;
  var isOut=result.indexOf('アウト')>=0||result==='三振',isBB=result==='四球';
  ABS[idx]=Object.assign({},ABS[idx],{
    inning:document.getElementById('e-inning').value,
    form:document.getElementById('e-form').value.trim()||ABS[idx].form,
    result:result,bases:parseInt(document.getElementById('e-bases').value)||0,
    pitches:epc,paNum:parseInt(document.getElementById('e-panum').value)||1,
    isOut:isOut,isOnBase:!isOut,isGoro:result.indexOf('ゴロ')===0,isLiner:result.indexOf('ライナー')===0,
    isHit:!isOut&&!isBB,isBB:isBB
  });
  ABS=recalcRBI(ABS);
  saveA();closeModal();refreshAfterChange();
}

function doAI(mode){
  var data,label,scoreFn;
  if(mode==='before36'){data=get36before();label='36球以前';scoreFn=calcScoreBefore36;}
  else if(mode==='after36'){data=get36after();label='36球以後';scoreFn=calcScoreAfter36;}
  else{data=ABS;label='全打席';scoreFn=calcScoreAll;}
  var byF={};
  data.forEach(function(a){if(!byF[a.form])byF[a.form]=[];byF[a.form].push(a);});
  var lines=['Wii Sports打者分析（'+label+'、'+data.length+'打席）\n'];
  Object.keys(byF).forEach(function(f){
    var s=calc(byF[f]);if(!s)return;
    var sc=scoreFn(s);
    lines.push(f+'（'+s.n+'打席, '+s.games+'ゲーム）: 打率'+fmt(s.avg)+' 出塁率'+fmt(s.obp)+' 長打率'+fmt(s.slg)+' 打点率'+fmt(s.rbiRate)+' 平均球数'+s.avgP.toFixed(1)+' 非ゴロ率'+fmt(s.nonGoroRate)+' スコア'+sc.toFixed(1));
  });
  lines.push('\n上記データをもとに、最も成績の良いバッティングフォームはどれか総合評価してください。');
  copyText(lines.join('\n')).then(function(){alert('分析用テキストをコピーしました。Claudeなどに貼り付けてください。');});
}

/* ============================================================
   タブ切り替え・再描画
   ============================================================ */
var TABS=['entry','stats','compare','swing','data'];
var CUR_TAB='entry';
function renderTab(name){
  if(name==='stats')renderStats();
  if(name==='swing')renderSwing();
  if(name==='compare')renderCompare();
  if(name==='data')renderDataInfo();
}
function switchTab(name){
  if(TABS.indexOf(name)<0)name='entry';
  CUR_TAB=name;
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name);});
  TABS.forEach(function(n){document.getElementById('tab-'+n).classList.toggle('active',n===name);});
  var at=document.querySelector('.tab.active');if(at&&at.scrollIntoView)at.scrollIntoView({block:'nearest',inline:'nearest'});
  if(location.hash!=='#'+name){try{history.replaceState(null,'','#'+name);}catch(e){}}
  renderTab(name);
}
function refreshAfterChange(){
  updatePitchSlider();
  renderHeader();renderRecent();renderChips();renderGameStatus();
  if(CUR_TAB!=='entry')renderTab(CUR_TAB);
  if(window.SYNC)SYNC.onLocalChange(); // クラウド同期へ通知（sync.js）
}

/* ============================================================
   データ（JSON書き出し・読み込み）
   ============================================================ */
function renderDataInfo(){
  var el=$('data-info');if(!el)return;
  var last=ABS.reduce(function(m,a){return a.id>m?a.id:m;},0);
  var lastTxt=last?new Date(last).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  el.innerHTML='<div class="data-info">'+
    '<div class="kpi"><div class="n">'+ABS.length+'</div><div class="d">保存中の打席</div></div>'+
    '<div class="kpi"><div class="n">'+FMS.length+'</div><div class="d">登録フォーム</div></div>'+
    '<div class="kpi"><div class="n" style="font-size:15px;">'+lastTxt+'</div><div class="d">最終記録</div></div></div>';
  if(window.SYNC)SYNC.render();
}
function toast(m){var e=document.getElementById('data-msg');if(e)e.textContent=m;}
function exportPayload(){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),abs:ABS,forms:FMS},null,1);}
function exportJSON(){var b=new Blob([exportPayload()],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='wii-baseball-data.json';a.click();toast('ダウンロードしました（'+ABS.length+'打席）');}
function copyText(t){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t);var x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();document.execCommand('copy');document.body.removeChild(x);return Promise.resolve();}
function copyJSON(){copyText(exportPayload()).then(function(){toast('コピーしました');});}
function applyImport(txt){
  try{var d=JSON.parse(txt);var abs=Array.isArray(d)?d:d.abs;if(!Array.isArray(abs))throw 0;
    ABS=recalcRBI(abs);if(d.forms&&d.forms.length)FMS=d.forms;saveA();saveF();refreshAfterChange();toast(ABS.length+'打席を読み込みました');}
  catch(e){toast('読み込めませんでした。JSONの形式を確認してください');}
}
function importFromText(){applyImport(document.getElementById('import-text').value);}
function importFromFile(inp){var f=inp.files[0];if(!f)return;var r=new FileReader();r.onload=function(){applyImport(r.result);};r.readAsText(f);}

/* ============================================================
   起動
   ============================================================ */
renderHeader();renderRecent();renderChips();renderGameStatus();updatePitchSlider();
switchTab((location.hash||'').slice(1)||'entry');
window.addEventListener('hashchange',function(){var h=(location.hash||'').slice(1);if(h&&h!==CUR_TAB)switchTab(h);});
