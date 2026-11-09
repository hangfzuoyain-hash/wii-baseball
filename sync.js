/* ============================================================
   GitHub Gist でのクラウド同期
   - 打席データ本体は今まで通り localStorage の wii_final / wii_final_f。
   - 同期の設定は別キー wii_sync に保存（token, gistId, deleted, localAt, lastSync）。
   - 端末間のデータは「打席ID」単位で合体する。削除した打席IDは deleted に記録して復活を防ぐ。
     同じIDが両方で違う内容のときは、更新時刻(updatedAt)が新しい側を採用。
   ============================================================ */
(function(){
  var FILE='wii-baseball-data.json';
  var API='https://api.github.com';
  var KEY='wii_sync';
  var cfg=load();
  var state={busy:false,again:false,status:cfg.token?'idle':'off',msg:'',timer:null,applying:false};

  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){return{};}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(cfg));}catch(e){}}
  function enabled(){return !!(cfg.token&&cfg.gistId);}
  function h(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function hm(t){return t?new Date(t).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'';}

  /* ---------- GitHub API ---------- */
  function gh(path,opt){
    opt=opt||{};
    var headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+cfg.token,'X-GitHub-Api-Version':'2022-11-28'};
    if(opt.body)headers['Content-Type']='application/json';
    return fetch(path.indexOf('http')===0?path:API+path,{method:opt.method||'GET',headers:headers,body:opt.body?JSON.stringify(opt.body):undefined,cache:'no-store'})
      .then(function(r){
        if(r.status===401)throw new Error('トークンが無効か期限切れです');
        if(r.status===404)throw new Error('Gistが見つかりません（削除された可能性）');
        if(r.status===403)throw new Error('権限がありません（トークンに gist 権限が必要）');
        if(!r.ok)throw new Error('GitHubエラー '+r.status);
        return r.status===204?null:r.json();
      });
  }
  function pull(){
    return gh('/gists/'+cfg.gistId).then(function(g){
      var f=g.files&&g.files[FILE];
      if(!f)return null;
      var p=f.truncated?fetch(f.raw_url,{cache:'no-store'}).then(function(r){return r.text();}):Promise.resolve(f.content);
      return p.then(function(t){
        if(!t||!t.trim())return null;
        var d=JSON.parse(t);
        return{abs:Array.isArray(d.abs)?d.abs:[],forms:Array.isArray(d.forms)?d.forms:[],deleted:Array.isArray(d.deleted)?d.deleted:[],updatedAt:d.updatedAt||0};
      });
    });
  }
  function payload(d){return JSON.stringify({version:1,app:'wii-baseball',updatedAt:d.updatedAt,exportedAt:new Date().toISOString(),abs:d.abs,forms:d.forms,deleted:d.deleted});}
  function push(d){
    var files={};files[FILE]={content:payload(d)};
    return gh('/gists/'+cfg.gistId,{method:'PATCH',body:{files:files}});
  }

  /* ---------- 合体 ---------- */
  function sortById(list){return list.slice().sort(function(a,b){return a.id-b.id;});}
  function sig(list){return JSON.stringify(sortById(list).map(function(a){return[a.id,a.form,a.inning,a.result,a.pitches,a.paNum,a.bases,a.isOut,a.isBB,a.isHit,a.isGoro,a.isLiner,a.isOnBase];}));}
  function uniq(arr){var s={},o=[];arr.forEach(function(x){if(x!=null&&!s[x]){s[x]=1;o.push(x);}});return o;}
  function merge(local,remote){
    var del=uniq((local.deleted||[]).concat(remote.deleted||[]));
    var delSet={};del.forEach(function(id){delSet[id]=1;});
    var localNewer=(local.updatedAt||0)>=(remote.updatedAt||0);
    var map={};
    remote.abs.forEach(function(a){map[a.id]=a;});
    local.abs.forEach(function(a){if(!map[a.id]||localNewer)map[a.id]=a;});
    var abs=Object.keys(map).map(function(k){return map[k];}).filter(function(a){return !delSet[a.id];});
    var forms=localNewer?uniq(local.forms.concat(remote.forms)):uniq(remote.forms.concat(local.forms));
    return{abs:sortById(abs),forms:forms,deleted:del,updatedAt:Math.max(local.updatedAt||0,remote.updatedAt||0)};
  }

  /* ---------- 同期本体 ---------- */
  function sync(){
    if(!enabled())return Promise.resolve();
    if(state.busy){state.again=true;return Promise.resolve();}
    state.busy=true;setStatus('syncing');
    var local={abs:ABS,forms:FMS,deleted:cfg.deleted||[],updatedAt:cfg.localAt||0};
    return pull().then(function(remote){
      var m=remote?merge(local,remote):{abs:sortById(local.abs),forms:local.forms,deleted:local.deleted,updatedAt:local.updatedAt||Date.now()};
      var localChanged=sig(m.abs)!==sig(ABS)||JSON.stringify(m.forms)!==JSON.stringify(FMS);
      var needPush=!remote||sig(m.abs)!==sig(remote.abs)||JSON.stringify(m.forms)!==JSON.stringify(remote.forms)||m.deleted.length!==remote.deleted.length;
      cfg.deleted=m.deleted;cfg.localAt=m.updatedAt;save();
      if(localChanged){
        ABS=recalcRBI(m.abs);FMS=m.forms;saveA();saveF();
        state.applying=true;try{refreshAfterChange();}finally{state.applying=false;}
      }
      return needPush?push({abs:ABS,forms:FMS,deleted:m.deleted,updatedAt:m.updatedAt}):null;
    }).then(function(){
      cfg.lastSync=Date.now();save();setStatus('ok');
    }).catch(function(e){
      setStatus('error',e&&e.message?e.message:String(e));
    }).then(function(){
      state.busy=false;
      if(state.again){state.again=false;return sync();}
    });
  }

  function findOrCreateGist(){
    function page(n){
      return gh('/gists?per_page=100&page='+n).then(function(list){
        var hit=(list||[]).filter(function(g){return g.files&&g.files[FILE];})
          .sort(function(a,b){return new Date(b.updated_at)-new Date(a.updated_at);})[0];
        if(hit)return hit.id;
        if(list&&list.length===100&&n<5)return page(n+1);
        return null;
      });
    }
    return page(1).then(function(id){
      if(id)return{id:id,created:false};
      var files={};files[FILE]={content:payload({abs:sortById(ABS),forms:FMS,deleted:cfg.deleted||[],updatedAt:cfg.localAt||Date.now()})};
      return gh('/gists',{method:'POST',body:{description:'Wii Sports 打撃フォーム分析のデータ（自動同期）',public:false,files:files}})
        .then(function(g){return{id:g.id,created:true};});
    });
  }

  /* ---------- 画面 ---------- */
  function setStatus(s,msg){state.status=s;state.msg=msg||'';renderBadge();renderPanel();}
  function renderBadge(){
    var el=document.getElementById('sync-badge');if(!el)return;
    var t,c;
    if(!enabled()){t='☁ 同期オフ';c='off';}
    else if(state.status==='syncing'){t='☁ 同期中…';c='busy';}
    else if(state.status==='error'){t='⚠ 同期エラー';c='err';}
    else if(state.status==='pending'){t='☁ 保存待ち…';c='busy';}
    else{t='☁ 同期済み '+hm(cfg.lastSync);c='ok';}
    el.textContent=t;el.className='sync-badge '+c;el.title=state.msg||'';
  }
  function renderPanel(){
    var el=document.getElementById('sync-panel');if(!el)return;
    if(!enabled()){
      el.innerHTML='<p class="sub" style="margin-bottom:8px;">GitHubの<b>シークレットGist</b>に自動保存して、PC・スマホなど複数の端末で同じデータを使えるようにします。各端末で最初に1回だけトークンを貼り付けてください。</p>'+
        '<ol class="sync-steps"><li><a href="https://github.com/settings/tokens/new?scopes=gist&description=wii-baseball-sync" target="_blank" rel="noopener">トークン作成ページ</a>を開く（GitHubにログイン）</li>'+
        '<li>「Expiration」で期限を選び（おすすめ: No expiration か 1年）、<b>gist</b>だけにチェックが入った状態で一番下の「Generate token」</li>'+
        '<li>表示された <code>ghp_…</code> をコピーして下に貼り付け →「接続」</li></ol>'+
        '<div class="sync-row"><input type="password" id="sync-token" placeholder="ghp_… を貼り付け" autocomplete="off" spellcheck="false">'+
        '<button type="button" class="btn btnp" onclick="SYNC.connect()">接続</button></div>'+
        (state.status==='error'&&state.msg?'<div class="sync-err">⚠ '+h(state.msg)+'</div>':'')+
        '<p class="hint" style="margin-top:8px;">トークンはこのブラウザ内にだけ保存され、GitHub以外には送られません。gist権限しかないので、リポジトリなど他のものは触れません。</p>';
    }else{
      el.innerHTML='<div class="sync-on"><div><div class="sync-state '+(state.status==='error'?'err':'ok')+'">'+
        (state.status==='error'?'⚠ 同期エラー：'+h(state.msg):state.status==='syncing'?'同期中…':'✓ 同期オン'+(cfg.lastSync?'（最終 '+new Date(cfg.lastSync).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+'）':''))+'</div>'+
        '<div class="hint">保存先：<a href="https://gist.github.com/'+h(cfg.gistId)+'" target="_blank" rel="noopener">シークレットGist</a>'+(cfg.login?'（'+h(cfg.login)+'）':'')+'</div></div>'+
        '<div class="actions"><button type="button" class="btn" onclick="SYNC.sync()">今すぐ同期</button><button type="button" class="btn" onclick="SYNC.disconnect()">この端末で同期をやめる</button></div></div>';
    }
  }

  /* ---------- 公開する操作 ---------- */
  function connect(){
    var inp=document.getElementById('sync-token');var tok=(inp&&inp.value||'').trim();
    if(!tok){setStatus('error','トークンを貼り付けてください');return Promise.resolve();}
    cfg.token=tok;setStatus('syncing');
    return gh('/user').then(function(u){
      cfg.login=u&&u.login;
      return findOrCreateGist();
    }).then(function(r){
      cfg.gistId=r.id;save();
      if(typeof toast==='function')toast(r.created?'新しいGistを作って同期を始めました':'既存のGistと同期しました');
      return sync();
    }).catch(function(e){
      cfg.token='';cfg.gistId='';save();
      setStatus('error',e&&e.message?e.message:String(e));
    });
  }
  function disconnect(){
    if(!window.confirm('この端末の同期設定（トークン）を消します。データ自体とGistは消えません。よろしいですか？'))return;
    delete cfg.token;delete cfg.gistId;delete cfg.login;save();setStatus('off');
  }
  function onLocalChange(){
    if(state.applying)return;
    cfg.localAt=Date.now();save();
    if(!enabled())return;
    setStatus('pending');
    clearTimeout(state.timer);state.timer=setTimeout(sync,1500);
  }
  function markDeleted(id){
    cfg.deleted=cfg.deleted||[];if(cfg.deleted.indexOf(id)<0)cfg.deleted.push(id);save();
  }

  window.SYNC={sync:sync,connect:connect,disconnect:disconnect,onLocalChange:onLocalChange,markDeleted:markDeleted,render:function(){renderBadge();renderPanel();},_merge:merge};

  renderBadge();renderPanel();
  if(enabled())sync();
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&enabled()&&!state.busy)sync();});
  window.addEventListener('pagehide',function(){if(state.status==='pending'&&enabled())sync();});
})();
