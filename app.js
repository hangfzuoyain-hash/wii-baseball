var ABS=[], FMS=[];
var rV='', rO=false, rB=1, CH=null, CH36=null, CHA36=null, editId=null;
var pitchCount=3, epc=3;
var THRESHOLD=36;
var swingSortKey='pred', swingSortDir=-1;
var REG_MODEL=null;

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
  document.getElementById('restore-banner').innerHTML=
    '<div style="font-size:11px;color:#1a7a40;background:#d4f0e0;padding:4px 10px;border-radius:6px;margin-bottom:8px;">'+
    'データ '+ABS.length+' 打席を読み込みました（重回帰分析による新総合スコアを追加）</div>';
})();

function saveA(){try{localStorage.setItem('wii_final',JSON.stringify(ABS));}catch(e){}}
function saveF(){try{localStorage.setItem('wii_final_f',JSON.stringify(FMS));}catch(e){}}

function selR(btn,val,isOut){
  document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('sel');});
  btn.classList.add('sel');rV=val;rO=isOut;
  var bw=document.getElementById('base-btns');
  bw.style.opacity=isOut?'0.3':'1';bw.style.pointerEvents=isOut?'none':'';
}
function selB(btn,n){document.querySelectorAll('.bb').forEach(function(b){b.classList.remove('sel');});btn.classList.add('sel');rB=n;}
function setBN(n){document.querySelectorAll('.bb').forEach(function(b,i){b.classList.toggle('sel',i===n-1);});rB=n;}
function renderChips(){
  var el=document.getElementById('saved-forms'),cur=document.getElementById('form-name').value.trim();
  el.innerHTML=FMS.map(function(f){
    return '<span class="chip'+(f===cur?' sel':'')+'" onclick="pickF(\''+f.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')">'+f+'</span>';
  }).join('');
}
function pickF(n){document.getElementById('form-name').value=n;renderChips();}
function clearFN(){document.getElementById('form-name').value='';renderChips();}
function clearR(){
  rV='';rO=false;rB=1;pitchCount=3;
  document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('sel');});
  setBN(1);
  document.getElementById('base-btns').style.opacity='1';document.getElementById('base-btns').style.pointerEvents='';
  document.getElementById('pitch-disp').textContent='3';
}
function changePitch(d){pitchCount=Math.max(1,Math.min(15,pitchCount+d));document.getElementById('pitch-disp').textContent=pitchCount;}
function changeEP(d){epc=Math.max(1,Math.min(15,epc+d));document.getElementById('e-pitch-disp').textContent=epc;}

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
  renderChips();
  document.getElementById('pa-num').value=pan+1;
  clearR();renderRecent();
  if(document.getElementById('tab-stats').classList.contains('active'))renderStats();
  if(document.getElementById('tab-swing').classList.contains('active'))renderSwing();
  if(document.getElementById('tab-compare').classList.contains('active'))renderCompare('all');
  if(document.getElementById('tab-compare36').classList.contains('active'))renderCompare('before36');
  if(document.getElementById('tab-compareAfter36').classList.contains('active'))renderCompare('after36');
}

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
  el.innerHTML='<table class="ltab"><thead><tr><th>回</th><th>フォーム</th><th>結果</th><th>球</th><th>打点</th></tr></thead><tbody>'+
    r.map(function(a){return '<tr><td>'+a.inning+'</td><td style="font-size:10px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+a.form+'</td><td>'+mkB(a)+'</td><td>'+a.pitches+'</td><td>'+(a.rbi||0)+'</td></tr>';}).join('')+'</tbody></table>';
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

function regressionNoteHtml(model){
  if(!model){
    return '<div class="reg-note">⚠ 重回帰分析には打席数3以上のフォームが5つ以上必要です。データが増えると自動的に計算されます。</div>';
  }
  var c=model.coeffs;
  return '<div class="reg-note">'+
    '📈 <b>重回帰分析モデル</b>（対象'+model.nForms+'フォーム, 決定係数 R²='+model.r2.toFixed(3)+'）<br>'+
    '予測打点率 = '+c[0].toFixed(4)+' + '+c[1].toFixed(4)+'×z(①タイミング) + '+c[2].toFixed(4)+'×z(②スピード) + '+c[3].toFixed(4)+'×z(③アングル)<br>'+
    '<span style="color:#3a8a5e;font-size:9.5px;">z(...)は各指標を偏差値化（平均50・標準偏差10）した値。係数が大きいほど打点率への影響が強い。</span>'+
    '</div>';
}

function statsCards(s,scoreFn){
  var sc=scoreFn(s);
  return '<div class="sc"><div class="n">'+s.n+'</div><div class="d">打席</div></div>'+
    '<div class="sc"><div class="n">'+s.games+'</div><div class="d">ゲーム数</div></div>'+
    '<div class="sc"><div class="n">'+fmt(s.avg)+'</div><div class="d">打率</div></div>'+
    '<div class="sc"><div class="n">'+fmt(s.obp)+'</div><div class="d">出塁率</div></div>'+
    '<div class="sc"><div class="n">'+fmt(s.slg)+'</div><div class="d">長打率</div></div>'+
    '<div class="sc"><div class="n">'+fmt(s.rbiRate)+'</div><div class="d">打点率</div></div>'+
    '<div class="sc"><div class="n">'+s.avgP.toFixed(1)+'</div><div class="d">平均球数</div></div>'+
    '<div class="sc"><div class="n">'+fmt(s.nonGoroRate)+'</div><div class="d">非ゴロ率</div></div>'+
    '<div class="sc"><div class="n">'+sc.toFixed(1)+'</div><div class="d">総合スコア</div></div>';
}
function formTable(data,scoreFn,noteHtml,model){
  var byF={};
  data.forEach(function(a){if(!byF[a.form])byF[a.form]=[];byF[a.form].push(a);});
  var forms=Object.keys(byF).map(function(f){
    var fs=calc(byF[f]);
    var raw=calcSwingRaw(byF[f]);
    var pred=model&&raw?predictRBI(model,raw.timing,raw.iso,raw.nongoro):null;
    var residual=pred!==null?fs.rbiRate-pred:null;
    return{form:f,stats:fs,score:scoreFn(fs),pred:pred,residual:residual};
  }).sort(function(a,b){return b.score-a.score;});
  var rows=forms.map(function(item,idx){
    var fs=item.stats,sc=item.score,f=item.form,isTop=idx===0;
    var predTxt=item.pred!==null?fmt(item.pred):'—';
    var resTxt=item.residual!==null?(item.residual>=0?'+':'')+fmt(item.residual):'—';
    var resCls=item.residual===null?'':(item.residual>=0?'pos-res':'neg-res');
    return '<tr'+(isTop?' style="background:#f0f0ff;"':'')+'>'+
      '<td style="font-weight:'+(isTop?'700':'500')+';color:'+(isTop?'#4444cc':'#222')+'">'+(isTop?'🥇 ':'')+f+'</td>'+
      '<td>'+fs.n+'</td><td>'+fs.games+'</td><td>'+fmt(fs.avg)+'</td><td>'+fmt(fs.obp)+'</td>'+
      '<td>'+fmt(fs.slg)+'</td><td>'+fmt(fs.rbiRate)+'</td><td>'+fs.avgP.toFixed(1)+'</td>'+
      '<td>'+fmt(fs.nonGoroRate)+'</td>'+
      '<td style="font-weight:600;color:'+(isTop?'#4444cc':'#333')+'">'+sc.toFixed(1)+'</td>'+
      '<td style="font-weight:600;color:#0a6b3e;">'+predTxt+'</td>'+
      '<td class="'+resCls+'">'+resTxt+'</td>'+
      '</tr>';
  }).join('');
  return '<div class="score-note">'+noteHtml+'</div>'+
    '<table class="ltab" style="margin-top:4px;"><thead><tr>'+
    '<th style="text-align:left;">フォーム</th><th>打席</th><th>ゲーム</th><th>打率</th><th>出塁率</th><th>長打率</th><th>打点率</th><th>平均球数</th><th>非ゴロ率</th><th>スコア</th>'+
    '<th>新スコア<br><span style="font-weight:400;">(予測打点率)</span></th><th>乖離</th>'+
    '</tr></thead><tbody>'+(rows||'<tr><td colspan="12" style="text-align:center;color:#bbb">データなし</td></tr>')+'</tbody></table>';
}

function renderSwing(){
  REG_MODEL=computeRegressionModel();
  document.getElementById('reg-note-swing').innerHTML=regressionNoteHtml(REG_MODEL);

  var byF={};
  ABS.forEach(function(a){if(!byF[a.form])byF[a.form]=[];byF[a.form].push(a);});
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

  var arrow=function(key){return swingSortKey===key ? (swingSortDir===-1?'▼':'▲') : '';};

  var rows=forms.map(function(item){
    var f=item.form, raw=item.raw;
    var predTxt=item.pred!==null?fmt(item.pred):'—';
    var resTxt=item.residual!==null?(item.residual>=0?'+':'')+fmt(item.residual):'—';
    var resCls=item.residual===null?'':(item.residual>=0?'pos-res':'neg-res');
    return '<tr>'+
      '<td style="font-weight:500;text-align:left;">'+f+'</td>'+
      '<td>'+raw.n+'</td>'+
      '<td>'+raw.timing.toFixed(3)+'</td>'+
      '<td>'+fmt(raw.iso)+'</td>'+
      '<td>'+fmt(raw.nongoro)+'</td>'+
      '<td>'+fmt(raw.rbiRate)+'</td>'+
      '<td style="font-weight:600;color:#0a6b3e;">'+predTxt+'</td>'+
      '<td class="'+resCls+'">'+resTxt+'</td>'+
      '</tr>';
  }).join('');

  document.getElementById('swing-table').innerHTML=
    '<table class="ltab"><thead><tr>'+
    '<th style="text-align:left;">フォーム</th><th>打席</th>'+
    '<th class="sortable-th" onclick="sortSwing(\'timing\')">①タイミング'+arrow('timing')+'</th>'+
    '<th class="sortable-th" onclick="sortSwing(\'iso\')">②スピード'+arrow('iso')+'</th>'+
    '<th class="sortable-th" onclick="sortSwing(\'nongoro\')">③アングル'+arrow('nongoro')+'</th>'+
    '<th>実際の打点率</th>'+
    '<th class="sortable-th" onclick="sortSwing(\'pred\')">④新スコア<br><span style="font-weight:400;font-size:9px;">予測打点率</span>'+arrow('pred')+'</th>'+
    '<th class="sortable-th" onclick="sortSwing(\'residual\')">乖離<br><span style="font-weight:400;font-size:9px;">実際−予測</span>'+arrow('residual')+'</th>'+
    '</tr></thead><tbody>'+
    (rows||'<tr><td colspan="8" style="text-align:center;color:#bbb">3打席以上のフォームがありません</td></tr>')+
    '</tbody></table>'+
    '<div style="font-size:9.5px;color:#888;margin-top:6px;">💡乖離がプラスのフォームは実力以上の結果、マイナスは「タイミング・スピード・アングルは優秀だが結果が出ていない＝不運だがポテンシャルが高い」フォームです。</div>';
}

window.sortSwing=function(key){
  if(swingSortKey===key){swingSortDir=swingSortDir===-1?1:-1;}
  else{swingSortKey=key;swingSortDir=-1;}
  renderSwing();
};

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

function renderStats(){
  REG_MODEL=computeRegressionModel();
  document.getElementById('reg-note-stats').innerHTML=regressionNoteHtml(REG_MODEL);

  var sA=calc(ABS),s36=calc(get36before()),sA36=calc(get36after());
  if(sA){document.getElementById('ost-all').innerHTML=statsCards(sA,calcScoreAll);document.getElementById('fst-all').innerHTML=formTable(ABS,calcScoreAll,noteAll,REG_MODEL);}
  if(s36){document.getElementById('ost-36').innerHTML=statsCards(s36,calcScoreBefore36);document.getElementById('fst-36').innerHTML=formTable(get36before(),calcScoreBefore36,noteBefore,REG_MODEL);}
  if(sA36){document.getElementById('ost-a36').innerHTML=statsCards(sA36,calcScoreAfter36);document.getElementById('fst-a36').innerHTML=formTable(get36after(),calcScoreAfter36,noteAfter,REG_MODEL);}
  if(!ABS.length){document.getElementById('full-log').innerHTML='<p class="empty">データなし</p>';return;}
  var rows='';
  var rev=ABS.slice().reverse();
  for(var i=0;i<rev.length;i++){
    var a=rev[i];
    var paDisp = a.paNum===1 ? '<span class="pa-highlight">'+a.paNum+'</span>' : a.paNum;
    rows+='<tr>'+
      '<td style="color:#bbb">'+(ABS.length-i)+'</td>'+
      '<td style="font-size:10px;">'+a.inning+'</td>'+
      '<td style="font-size:10px;max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+a.form+'</td>'+
      '<td>'+mkB(a)+'</td>'+
      '<td>'+paDisp+'</td>'+
      '<td>'+a.pitches+'球</td><td>'+(a.rbi||0)+'</td>'+
      '<td style="white-space:nowrap;">'+
        '<button style="padding:2px 6px;font-size:10px;border:1px solid #b3d0f7;border-radius:4px;background:#eef5ff;color:#1a5aad;cursor:pointer;margin-right:2px;" onclick="window.WII_EDIT('+a.id+')">編</button>'+
        '<button style="padding:2px 6px;font-size:10px;border:1px solid #f5c0c0;border-radius:4px;background:#fff5f5;color:#b01a1a;cursor:pointer;" onclick="window.WII_DEL('+a.id+')">削</button>'+
      '</td></tr>';
  }
  document.getElementById('full-log').innerHTML=
    '<table class="ltab"><thead><tr><th>#</th><th>回</th><th>フォーム</th><th>結果</th><th>通算</th><th>球</th><th>打点</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
}

window.WII_DEL=function(id){
  var numId=parseInt(id,10);
  if(!window.confirm('削除しますか？'))return;
  ABS=ABS.filter(function(x){return x.id!==numId;});
  ABS=recalcRBI(ABS);
  saveA();renderRecent();renderStats();
  if(document.getElementById('tab-swing').classList.contains('active'))renderSwing();
  if(document.getElementById('tab-compare').classList.contains('active'))renderCompare('all');
  if(document.getElementById('tab-compare36').classList.contains('active'))renderCompare('before36');
  if(document.getElementById('tab-compareAfter36').classList.contains('active'))renderCompare('after36');
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
  epc=a.pitches||3;document.getElementById('e-pitch-disp').textContent=epc;
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
  saveA();closeModal();renderRecent();renderStats();
  if(document.getElementById('tab-swing').classList.contains('active'))renderSwing();
  if(document.getElementById('tab-compare').classList.contains('active'))renderCompare('all');
  if(document.getElementById('tab-compare36').classList.contains('active'))renderCompare('before36');
  if(document.getElementById('tab-compareAfter36').classList.contains('active'))renderCompare('after36');
}

function renderCompare(mode){
  var data,cid,rid,scoreFn,noteHtml;
  if(mode==='before36'){data=get36before();cid='cmpChart36';rid='form-ranking36';scoreFn=calcScoreBefore36;noteHtml=noteBefore;}
  else if(mode==='after36'){data=get36after();cid='cmpChartA36';rid='form-rankingA36';scoreFn=calcScoreAfter36;noteHtml=noteAfter;}
  else{data=ABS;cid='cmpChart';rid='form-ranking';scoreFn=calcScoreAll;noteHtml=noteAll;}
  var old=mode==='before36'?CH36:(mode==='after36'?CHA36:CH);
  var byF={};
  data.forEach(function(a){if(!byF[a.form])byF[a.form]=[];byF[a.form].push(a);});
  var fms=Object.keys(byF).filter(function(f){return byF[f].length>=2;});
  var rEl=document.getElementById(rid);
  if(!fms.length){
    rEl.innerHTML='<p class="empty">2打席以上のフォームがありません</p>';
    if(old)old.destroy();
    if(mode==='before36')CH36=null;else if(mode==='after36')CHA36=null;else CH=null;
    return;
  }
  var obpA=fms.map(function(f){return calc(byF[f]).obp;});
  var pitA=fms.map(function(f){return calc(byF[f]).avgP;});
  var ngrA=fms.map(function(f){return calc(byF[f]).nonGoroRate;});
  var slgA=fms.map(function(f){return calc(byF[f]).slg;});
  if(old)old.destroy();
  var nc=new Chart(document.getElementById(cid).getContext('2d'),{
    type:'bar',
    data:{labels:fms,datasets:[
      {label:'出塁率',data:obpA,backgroundColor:'#2a78d6',borderRadius:3},
      {label:'平均球数(÷10)',data:pitA.map(function(v){return v/10;}),backgroundColor:'#1baf7a',borderRadius:3},
      {label:'非ゴロ率',data:ngrA,backgroundColor:'#e34948',borderRadius:3},
      {label:'長打率',data:slgA.map(function(v){return Math.min(v,1);}),backgroundColor:'#eda100',borderRadius:3}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){
        if(ctx.datasetIndex===1)return'平均球数: '+(ctx.raw*10).toFixed(1);
        var f=fms[ctx.dataIndex];
        if(ctx.datasetIndex===3)return'長打率: '+fmt(calc(byF[f]).slg);
        return ctx.dataset.label+': '+fmt(ctx.raw);
      }}}},
      scales:{x:{grid:{display:false},ticks:{color:'#888',font:{size:9}}},
              y:{beginAtZero:true,max:1,ticks:{color:'#888',font:{size:9},callback:function(v){return v.toFixed(2);}}}}}
  });
  if(mode==='before36')CH36=nc;else if(mode==='after36')CHA36=nc;else CH=nc;
  var scored=fms.map(function(f,i){
    var fs=calc(byF[f]);
    var sc=scoreFn(fs);
    return{form:f,n:fs.n,games:fs.games,obp:fs.obp,slg:fs.slg,avgP:fs.avgP,ngr:fs.nonGoroRate,rbiRate:fs.rbiRate,score:sc};
  }).sort(function(a,b){return b.score-a.score;});
  rEl.innerHTML='<div class="score-note" style="margin-top:8px;">'+noteHtml+'</div>'+
    '<table class="ltab"><thead><tr><th>順位</th><th>フォーム</th><th>打席</th><th>ゲーム</th><th>スコア</th><th>出塁率</th><th>長打率</th><th>平均球数</th><th>非ゴロ率</th><th>打点率</th></tr></thead><tbody>'+
    scored.map(function(s,i){
      return '<tr'+(i===0?' style="background:#f0f0ff;"':'')+'>'+
        '<td style="color:#bbb">'+(i+1)+'</td>'+
        '<td style="font-weight:'+(i===0?'700':'500')+';color:'+(i===0?'#4444cc':'#222')+'">'+(i===0?'🥇 ':'')+s.form+'</td>'+
        '<td style="color:#aaa">'+s.n+'</td>'+
        '<td style="color:#aaa">'+s.games+'</td>'+
        '<td style="font-weight:600;color:'+(i===0?'#4444cc':'#333')+'">'+s.score.toFixed(1)+'</td>'+
        '<td>'+fmt(s.obp)+'</td><td>'+fmt(s.slg)+'</td>'+
        '<td>'+s.avgP.toFixed(1)+'</td><td>'+fmt(s.ngr)+'</td><td>'+fmt(s.rbiRate)+'</td></tr>';
    }).join('')+'</tbody></table>';
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

function switchTab(name){
  ['entry','stats','swing','compare','compare36','compareAfter36','data'].forEach(function(n,i){
    document.querySelectorAll('.tab')[i].classList.toggle('active',n===name);
    document.getElementById('tab-'+n).classList.toggle('active',n===name);
  });
  if(name==='stats')renderStats();
  if(name==='swing')renderSwing();
  if(name==='compare')renderCompare('all');
  if(name==='compare36')renderCompare('before36');
  if(name==='compareAfter36')renderCompare('after36');
}

function toast(m){var e=document.getElementById('data-msg');if(e)e.textContent=m;}
function exportPayload(){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),abs:ABS,forms:FMS},null,1);}
function exportJSON(){var b=new Blob([exportPayload()],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='wii-baseball-data.json';a.click();toast('ダウンロードしました（'+ABS.length+'打席）');}
function copyText(t){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t);var x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();document.execCommand('copy');document.body.removeChild(x);return Promise.resolve();}
function copyJSON(){copyText(exportPayload()).then(function(){toast('コピーしました');});}
function applyImport(txt){
  try{var d=JSON.parse(txt);var abs=Array.isArray(d)?d:d.abs;if(!Array.isArray(abs))throw 0;
    ABS=recalcRBI(abs);if(d.forms&&d.forms.length)FMS=d.forms;saveA();saveF();renderRecent();renderChips();toast(ABS.length+'打席を読み込みました');}
  catch(e){toast('読み込めませんでした。JSONの形式を確認してください');}
}
function importFromText(){applyImport(document.getElementById('import-text').value);}
function importFromFile(inp){var f=inp.files[0];if(!f)return;var r=new FileReader();r.onload=function(){applyImport(r.result);};r.readAsText(f);}
renderRecent();renderChips();
