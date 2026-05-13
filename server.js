// ============================================================
//  本部Connect - バックエンドサーバー (sql.js版 ビルド不要)
//  起動: node server.js
//  アクセス: http://localhost:3000
// ============================================================

const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const path      = require('path');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');
const initSqlJs = require('sql.js');

const app        = express();
const PORT       = 3000;
const JWT_SECRET = 'honbu-connect-secret-2026';
const DB_FILE    = path.join(__dirname, 'honbu_connect.db');

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── sql.js DB ───────────────────────────────────────────────
let sqlDb = null;

function saveDb() {
  fs.writeFileSync(DB_FILE, Buffer.from(sqlDb.export()));
}

const db = {
  exec(sql) { sqlDb.run(sql); saveDb(); },
  run(sql, p=[]) { sqlDb.run(sql, p); saveDb(); },
  get(sql, p=[]) {
    const s = sqlDb.prepare(sql); s.bind(p);
    const row = s.step() ? s.getAsObject() : undefined;
    s.free(); return row;
  },
  all(sql, p=[]) {
    const s = sqlDb.prepare(sql); s.bind(p);
    const rows = [];
    while (s.step()) rows.push(s.getAsObject());
    s.free(); return rows;
  },
};

function nowStr() {
  return new Date().toLocaleString('ja-JP',{hour12:false});
}

// ─── スキーマ ────────────────────────────────────────────────
async function initDb() {
  const SQL = await initSqlJs();
  sqlDb = fs.existsSync(DB_FILE)
    ? new SQL.Database(fs.readFileSync(DB_FILE))
    : new SQL.Database();

  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT DEFAULT '',
      code TEXT UNIQUE, active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
      role TEXT NOT NULL, store_id TEXT, active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS instructions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT DEFAULT 'その他',
      content TEXT DEFAULT '', created_by TEXT, created_by_name TEXT DEFAULT '',
      deadline TEXT, requires_response INTEGER DEFAULT 0,
      response_question TEXT DEFAULT '', pinned INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft', created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS instruction_targets (
      instruction_id TEXT NOT NULL, store_id TEXT NOT NULL,
      PRIMARY KEY (instruction_id, store_id)
    );
    CREATE TABLE IF NOT EXISTS instruction_choices (
      id TEXT PRIMARY KEY, instruction_id TEXT NOT NULL,
      choice_text TEXT NOT NULL, order_num INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS instruction_reads (
      instruction_id TEXT NOT NULL, store_id TEXT NOT NULL,
      user_id TEXT, read_at TEXT,
      PRIMARY KEY (instruction_id, store_id)
    );
    CREATE TABLE IF NOT EXISTS instruction_responses (
      id TEXT PRIMARY KEY, instruction_id TEXT NOT NULL,
      store_id TEXT NOT NULL, user_id TEXT, answer TEXT NOT NULL,
      responded_at TEXT, UNIQUE(instruction_id, store_id)
    );
  `);

  if (!db.get("SELECT id FROM users WHERE role='admin'")) seed();
}

function seed() {
  console.log('初期データ作成中...');
  const stores = [
    {id:'S001',name:'渋谷店', area:'東京',  code:'SHB'},
    {id:'S002',name:'新宿店', area:'東京',  code:'SJK'},
    {id:'S003',name:'池袋店', area:'東京',  code:'IKB'},
    {id:'S004',name:'品川店', area:'東京',  code:'SGW'},
    {id:'S005',name:'銀座店', area:'東京',  code:'GNZ'},
    {id:'S006',name:'横浜店', area:'神奈川',code:'YKH'},
    {id:'S007',name:'川崎店', area:'神奈川',code:'KWS'},
    {id:'S008',name:'大宮店', area:'埼玉',  code:'OMY'},
  ];
  stores.forEach(s => { try { db.run('INSERT INTO stores VALUES (?,?,?,?,1,datetime("now","localtime"))',[s.id,s.name,s.area,s.code]); } catch{} });

  const addU = (u,p,n,r,s) => { try { db.run('INSERT INTO users (id,username,password_hash,display_name,role,store_id) VALUES (?,?,?,?,?,?)',[uuidv4(),u,bcrypt.hashSync(p,10),n,r,s]); } catch{} };
  addU('admin','admin123','管理者','admin',null);
  addU('hq_sales','hq123','本部 販促部','hq',null);
  addU('hq_ops','hq123','本部 設備管理部','hq',null);
  addU('hq_hr','hq123','本部 総務部','hq',null);
  stores.forEach(s => addU(`store_${s.id.toLowerCase()}`,'store123',`${s.name} 店長`,'store',s.id));

  const hs = db.get("SELECT id,display_name FROM users WHERE username='hq_sales'");
  const ho = db.get("SELECT id,display_name FROM users WHERE username='hq_ops'");
  const hh = db.get("SELECT id,display_name FROM users WHERE username='hq_hr'");

  const i1=uuidv4(), i2=uuidv4(), i3=uuidv4();
  const addI=(id,title,cat,content,by,byN,dl,rr,rq,pin,st,ca)=>
    db.run('INSERT INTO instructions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,title,cat,content,by,byN,dl,rr?1:0,rq,pin?1:0,st,ca,ca]);

  addI(i1,'【重要】夏季セール実施について','販促',
    '<h2 style="color:#1a2f4a;border-bottom:2px solid #1a2f4a;padding-bottom:8px">夏季セール実施のご案内</h2><p>本部 販促部よりご連絡申し上げます。夏季セールを実施いたしますのでご準備をお願いいたします。</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr style="background:#1a2f4a;color:white"><th style="border:1px solid #1a2f4a;padding:8px">項目</th><th style="border:1px solid #1a2f4a;padding:8px">内容</th></tr></thead><tbody><tr><td style="border:1px solid #ccc;padding:8px;background:#f8f9fa">実施期間</td><td style="border:1px solid #ccc;padding:8px">2026年6月1日〜30日</td></tr><tr><td style="border:1px solid #ccc;padding:8px;background:#f8f9fa">割引率</td><td style="border:1px solid #ccc;padding:8px">最大30%OFF</td></tr></tbody></table>',
    hs.id,hs.display_name,'2026-05-20',true,'準備状況を報告してください',true,'published','2026-05-08 09:00');
  addI(i2,'レジ釣銭機 定期メンテナンスのお知らせ','設備',
    '<h2 style="color:#1a2f4a;border-bottom:2px solid #1a2f4a;padding-bottom:8px">レジ釣銭機 定期メンテナンス</h2><p>設備管理部よりご連絡です。レジ釣銭機の定期メンテナンスを実施いたします。</p><div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:12px 0"><strong>⚠ 注意：</strong>メンテナンス中（約1時間）は釣銭機が使用できません。</div>',
    ho.id,ho.display_name,'2026-05-25',true,'訪問希望日を選択してください',false,'published','2026-05-09 10:00');
  addI(i3,'防災訓練実施報告の提出について','安全・衛生',
    '<h2 style="color:#1a2f4a;border-bottom:2px solid #1a2f4a;padding-bottom:8px">防災訓練実施報告</h2><p>毎年恒例の防災訓練の実施状況をご報告ください。期限は<strong>5月12日（火）</strong>です。</p>',
    hh.id,hh.display_name,'2026-05-12',true,'防災訓練は実施しましたか？',false,'published','2026-05-05 09:00');

  stores.forEach(s=>{
    [i1,i2,i3].forEach(id=>{ try{db.run('INSERT INTO instruction_targets VALUES (?,?)',[id,s.id]);}catch{} });
  });
  [['準備完了',0],['準備中',1],['未着手',2]].forEach(([c,n])=>db.run('INSERT INTO instruction_choices (id,instruction_id,choice_text,order_num) VALUES (?,?,?,?)',[uuidv4(),i1,c,n]));
  [['5/21（木）',0],['5/22（金）',1],['5/25（月）',2],['5/26（火）',3]].forEach(([c,n])=>db.run('INSERT INTO instruction_choices (id,instruction_id,choice_text,order_num) VALUES (?,?,?,?)',[uuidv4(),i2,c,n]));
  [['実施済み',0],['未実施（理由あり）',1],['未実施（理由なし）',2]].forEach(([c,n])=>db.run('INSERT INTO instruction_choices (id,instruction_id,choice_text,order_num) VALUES (?,?,?,?)',[uuidv4(),i3,c,n]));

  [['S001','準備完了'],['S002','準備中'],['S003','準備完了'],['S005','準備完了'],['S006','準備中']].forEach(([sid,ans])=>{
    const u=db.get("SELECT id FROM users WHERE store_id=? AND role='store'",[sid]);
    if(u){ try{db.run('INSERT INTO instruction_reads (instruction_id,store_id,user_id,read_at) VALUES (?,?,?,?)',[i1,sid,u.id,'2026-05-10 09:00']);}catch{} try{db.run('INSERT INTO instruction_responses (id,instruction_id,store_id,user_id,answer,responded_at) VALUES (?,?,?,?,?,?)',[uuidv4(),i1,sid,u.id,ans,'2026-05-10 09:00']);}catch{} }
  });
  [['S001','5/21（木）'],['S003','5/22（金）'],['S007','5/25（月）']].forEach(([sid,ans])=>{
    const u=db.get("SELECT id FROM users WHERE store_id=? AND role='store'",[sid]);
    if(u){ try{db.run('INSERT INTO instruction_reads (instruction_id,store_id,user_id,read_at) VALUES (?,?,?,?)',[i2,sid,u.id,'2026-05-10 10:00']);}catch{} try{db.run('INSERT INTO instruction_responses (id,instruction_id,store_id,user_id,answer,responded_at) VALUES (?,?,?,?,?,?)',[uuidv4(),i2,sid,u.id,ans,'2026-05-10 10:00']);}catch{} }
  });
  stores.forEach(s=>{
    const ans=s.id==='S004'?'未実施（理由あり）':'実施済み';
    const u=db.get("SELECT id FROM users WHERE store_id=? AND role='store'",[s.id]);
    if(u){ try{db.run('INSERT INTO instruction_reads (instruction_id,store_id,user_id,read_at) VALUES (?,?,?,?)',[i3,s.id,u.id,'2026-05-08 10:00']);}catch{} try{db.run('INSERT INTO instruction_responses (id,instruction_id,store_id,user_id,answer,responded_at) VALUES (?,?,?,?,?,?)',[uuidv4(),i3,s.id,u.id,ans,'2026-05-08 10:00']);}catch{} }
  });
  console.log('初期データ完了');
}

// ─── 認証MW ──────────────────────────────────────────────────
function auth(req,res,next){
  const t=(req.headers['authorization']||'').split(' ')[1];
  if(!t) return res.status(401).json({error:'認証が必要です'});
  try{ req.user=jwt.verify(t,JWT_SECRET); next(); }
  catch{ res.status(401).json({error:'トークンが無効です'}); }
}
const requireHQ=(req,res,next)=>req.user.role==='store'?res.status(403).json({error:'権限がありません'}):next();
const requireAdmin=(req,res,next)=>req.user.role!=='admin'?res.status(403).json({error:'管理者権限が必要です'}):next();

function getInst(id){
  const inst=db.get('SELECT * FROM instructions WHERE id=?',[id]);
  if(!inst) return null;
  inst.targets=db.all('SELECT store_id FROM instruction_targets WHERE instruction_id=?',[id]).map(r=>r.store_id);
  inst.choices=db.all('SELECT choice_text FROM instruction_choices WHERE instruction_id=? ORDER BY order_num',[id]).map(r=>r.choice_text);
  inst.requires_response=inst.requires_response===1;
  inst.pinned=inst.pinned===1;
  return inst;
}

// ─── 認証API ─────────────────────────────────────────────────
app.post('/api/auth/login',(req,res)=>{
  const {username,password}=req.body;
  const user=db.get('SELECT * FROM users WHERE username=? AND active=1',[username]);
  if(!user||!bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:'ユーザー名またはパスワードが間違っています'});
  const token=jwt.sign({id:user.id,username:user.username,display_name:user.display_name,role:user.role,store_id:user.store_id},JWT_SECRET,{expiresIn:'24h'});
  const store=user.store_id?db.get('SELECT * FROM stores WHERE id=?',[user.store_id]):null;
  res.json({token,user:{id:user.id,username:user.username,display_name:user.display_name,role:user.role,store_id:user.store_id,store}});
});
app.get('/api/auth/me',auth,(req,res)=>{
  const user=db.get('SELECT id,username,display_name,role,store_id FROM users WHERE id=?',[req.user.id]);
  if(!user) return res.status(404).json({error:'見つかりません'});
  const store=user.store_id?db.get('SELECT * FROM stores WHERE id=?',[user.store_id]):null;
  res.json({...user,store});
});

// ─── 店舗API ─────────────────────────────────────────────────
app.get('/api/stores',auth,(req,res)=>res.json(db.all('SELECT * FROM stores WHERE active=1 ORDER BY area,name')));
app.post('/api/stores',auth,requireAdmin,(req,res)=>{
  const {name,area,code}=req.body;
  if(!name) return res.status(400).json({error:'店舗名は必須です'});
  const c=db.get('SELECT COUNT(*) as c FROM stores').c;
  const id='S'+String(Number(c)+1).padStart(3,'0');
  try{ db.run('INSERT INTO stores (id,name,area,code) VALUES (?,?,?,?)',[id,name,area||'',code||null]); res.json(db.get('SELECT * FROM stores WHERE id=?',[id])); }
  catch(e){ res.status(400).json({error:'コードが重複しています'}); }
});
app.delete('/api/stores/:id',auth,requireAdmin,(req,res)=>{ db.run('UPDATE stores SET active=0 WHERE id=?',[req.params.id]); res.json({ok:true}); });

// ─── ユーザーAPI ─────────────────────────────────────────────
app.get('/api/users',auth,requireAdmin,(req,res)=>res.json(db.all('SELECT id,username,display_name,role,store_id,active,created_at FROM users ORDER BY role,display_name')));
app.post('/api/users',auth,requireAdmin,(req,res)=>{
  const {username,password,display_name,role,store_id}=req.body;
  if(!username||!password||!display_name||!role) return res.status(400).json({error:'必須項目を入力してください'});
  try{
    const id=uuidv4();
    db.run('INSERT INTO users (id,username,password_hash,display_name,role,store_id) VALUES (?,?,?,?,?,?)',[id,username,bcrypt.hashSync(password,10),display_name,role,store_id||null]);
    res.json(db.get('SELECT id,username,display_name,role,store_id FROM users WHERE id=?',[id]));
  }catch(e){ res.status(400).json({error:'ユーザー名が既に存在します'}); }
});
app.put('/api/users/:id',auth,requireAdmin,(req,res)=>{
  const {active}=req.body;
  if(active!==undefined) db.run('UPDATE users SET active=? WHERE id=?',[active,req.params.id]);
  res.json({ok:true});
});

// ─── 指示書API ───────────────────────────────────────────────
app.get('/api/instructions',auth,(req,res)=>{
  let rows=req.user.role==='store'
    ? db.all("SELECT i.* FROM instructions i JOIN instruction_targets t ON t.instruction_id=i.id WHERE t.store_id=? AND i.status='published' ORDER BY i.pinned DESC,i.created_at DESC",[req.user.store_id])
    : db.all('SELECT * FROM instructions ORDER BY pinned DESC,created_at DESC');
  res.json(rows.map(inst=>{
    inst.targets=db.all('SELECT store_id FROM instruction_targets WHERE instruction_id=?',[inst.id]).map(r=>r.store_id);
    inst.choices=db.all('SELECT choice_text FROM instruction_choices WHERE instruction_id=? ORDER BY order_num',[inst.id]).map(r=>r.choice_text);
    inst.response_count=Number((db.get('SELECT COUNT(*) as c FROM instruction_responses WHERE instruction_id=?',[inst.id])||{c:0}).c);
    inst.read_count=Number((db.get('SELECT COUNT(*) as c FROM instruction_reads WHERE instruction_id=?',[inst.id])||{c:0}).c);
    inst.requires_response=inst.requires_response===1;
    inst.pinned=inst.pinned===1;
    if(req.user.role==='store'){
      inst.my_read=db.get('SELECT read_at FROM instruction_reads WHERE instruction_id=? AND store_id=?',[inst.id,req.user.store_id])?.read_at||null;
      const mr=db.get('SELECT answer,responded_at FROM instruction_responses WHERE instruction_id=? AND store_id=?',[inst.id,req.user.store_id]);
      inst.my_response=mr?.answer||null;
    }
    return inst;
  }));
});

app.post('/api/instructions',auth,requireHQ,(req,res)=>{
  const {title,category,content,deadline,requires_response,response_question,choices,target_stores,pinned,status}=req.body;
  if(!title) return res.status(400).json({error:'タイトルは必須です'});
  const id=uuidv4(), now=nowStr();
  db.run('INSERT INTO instructions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,title,category||'その他',content||'',req.user.id,req.user.display_name,deadline||null,requires_response?1:0,response_question||'',pinned?1:0,status||'draft',now,now]);
  (target_stores||[]).forEach(sid=>{try{db.run('INSERT INTO instruction_targets VALUES (?,?)',[id,sid]);}catch{}});
  (choices||[]).forEach((c,i)=>db.run('INSERT INTO instruction_choices (id,instruction_id,choice_text,order_num) VALUES (?,?,?,?)',[uuidv4(),id,c,i]));
  res.json(getInst(id));
});

app.get('/api/instructions/:id',auth,(req,res)=>{
  const inst=getInst(req.params.id);
  if(!inst) return res.status(404).json({error:'見つかりません'});
  if(req.user.role==='store'){
    inst.my_read=db.get('SELECT read_at FROM instruction_reads WHERE instruction_id=? AND store_id=?',[inst.id,req.user.store_id])?.read_at||null;
    inst.my_response=db.get('SELECT answer,responded_at FROM instruction_responses WHERE instruction_id=? AND store_id=?',[inst.id,req.user.store_id])||null;
  }
  res.json(inst);
});

app.put('/api/instructions/:id',auth,requireHQ,(req,res)=>{
  const {title,category,content,deadline,requires_response,response_question,choices,target_stores,pinned,status}=req.body;
  const now=nowStr();
  db.run('UPDATE instructions SET title=COALESCE(?,title),category=COALESCE(?,category),content=COALESCE(?,content),deadline=?,requires_response=COALESCE(?,requires_response),response_question=COALESCE(?,response_question),pinned=COALESCE(?,pinned),status=COALESCE(?,status),updated_at=? WHERE id=?',
    [title,category,content,deadline||null,requires_response!=null?requires_response?1:0:null,response_question,pinned!=null?pinned?1:0:null,status,now,req.params.id]);
  if(target_stores){
    db.run('DELETE FROM instruction_targets WHERE instruction_id=?',[req.params.id]);
    target_stores.forEach(sid=>{try{db.run('INSERT INTO instruction_targets VALUES (?,?)',[req.params.id,sid]);}catch{}});
  }
  if(choices){
    db.run('DELETE FROM instruction_choices WHERE instruction_id=?',[req.params.id]);
    choices.forEach((c,i)=>db.run('INSERT INTO instruction_choices (id,instruction_id,choice_text,order_num) VALUES (?,?,?,?)',[uuidv4(),req.params.id,c,i]));
  }
  res.json(getInst(req.params.id));
});

app.delete('/api/instructions/:id',auth,requireHQ,(req,res)=>{
  ['instruction_targets','instruction_choices','instruction_reads','instruction_responses'].forEach(t=>db.run(`DELETE FROM ${t} WHERE instruction_id=?`,[req.params.id]));
  db.run('DELETE FROM instructions WHERE id=?',[req.params.id]);
  res.json({ok:true});
});

app.post('/api/instructions/:id/read',auth,(req,res)=>{
  if(!req.user.store_id) return res.status(400).json({error:'店舗ユーザーのみ'});
  try{db.run('INSERT OR IGNORE INTO instruction_reads (instruction_id,store_id,user_id,read_at) VALUES (?,?,?,?)',[req.params.id,req.user.store_id,req.user.id,nowStr()]);}catch{}
  res.json({ok:true});
});

app.post('/api/instructions/:id/respond',auth,(req,res)=>{
  if(!req.user.store_id) return res.status(400).json({error:'店舗ユーザーのみ'});
  const {answer}=req.body;
  if(!answer) return res.status(400).json({error:'回答を選択してください'});
  const now=nowStr();
  try{
    db.run('DELETE FROM instruction_responses WHERE instruction_id=? AND store_id=?',[req.params.id,req.user.store_id]);
    db.run('INSERT INTO instruction_responses (id,instruction_id,store_id,user_id,answer,responded_at) VALUES (?,?,?,?,?,?)',[uuidv4(),req.params.id,req.user.store_id,req.user.id,answer,now]);
    try{db.run('INSERT OR IGNORE INTO instruction_reads (instruction_id,store_id,user_id,read_at) VALUES (?,?,?,?)',[req.params.id,req.user.store_id,req.user.id,now]);}catch{}
    res.json({ok:true,answer,responded_at:now});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/instructions/:id/aggregate',auth,requireHQ,(req,res)=>{
  const inst=getInst(req.params.id);
  if(!inst) return res.status(404).json({error:'見つかりません'});
  const stores=inst.targets.map(sid=>{
    const s=db.get('SELECT * FROM stores WHERE id=?',[sid]);
    const read=db.get('SELECT read_at FROM instruction_reads WHERE instruction_id=? AND store_id=?',[inst.id,sid]);
    const resp=db.get('SELECT answer,responded_at FROM instruction_responses WHERE instruction_id=? AND store_id=?',[inst.id,sid]);
    return{...s,read_at:read?.read_at||null,answer:resp?.answer||null,responded_at:resp?.responded_at||null};
  });
  const byChoice={};
  (inst.choices||[]).forEach(c=>{byChoice[c]=0;});
  stores.forEach(s=>{if(s.answer&&byChoice[s.answer]!==undefined)byChoice[s.answer]++;});
  res.json({instruction:inst,stores,total:stores.length,read_count:stores.filter(s=>s.read_at).length,response_count:stores.filter(s=>s.answer).length,by_choice:byChoice});
});

app.get('/api/instructions/:id/export',auth,requireHQ,(req,res)=>{
  const inst=getInst(req.params.id);
  if(!inst) return res.status(404).json({error:'見つかりません'});
  const rows=[['店舗ID','店舗名','エリア','既読日時','回答','回答日時']];
  inst.targets.forEach(sid=>{
    const s=db.get('SELECT * FROM stores WHERE id=?',[sid]);
    const read=db.get('SELECT read_at FROM instruction_reads WHERE instruction_id=? AND store_id=?',[inst.id,sid]);
    const resp=db.get('SELECT answer,responded_at FROM instruction_responses WHERE instruction_id=? AND store_id=?',[inst.id,sid]);
    rows.push([s?.id||'',s?.name||'',s?.area||'',read?.read_at||'',resp?.answer||'',resp?.responded_at||'']);
  });
  const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="export.csv"');
  res.send(csv);
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

// ─── 起動 ────────────────────────────────────────────────────
initDb().then(()=>{
  app.listen(PORT,'0.0.0.0',()=>{
    console.log('\n========================================');
    console.log('  本部Connect 起動中');
    console.log(`  http://localhost:${PORT}`);
    console.log('========================================');
    console.log('\n  ログイン情報:');
    console.log('  管理者:  admin / admin123');
    console.log('  本部:    hq_sales / hq123');
    console.log('  店舗:    store_s001 / store123\n');
  });
}).catch(e=>{ console.error('起動エラー:',e); process.exit(1); });
