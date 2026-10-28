/* Private shared kitchen: Supabase Auth + database + private image storage. */
let cloud = null, poll = null, syncing = false, sessionEpoch = 0;
const imageCache = new Map();
const statusText = t => document.querySelector('#syncStatus').textContent = t;
function clearImages(){for(const x of imageCache.values())URL.revokeObjectURL(x);imageCache.clear();}
function lockKitchen(message='请登录家庭账号'){
  sessionEpoch++; loaded=false; clearInterval(poll); clearImages();
  state={recipes:[],pantry:[]};revision=0;render();
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  document.querySelector('#randomResult').innerHTML='';
  document.querySelector('#familyApp').hidden=true;
  document.querySelector('#authPanel').hidden=false;
  document.querySelector('#authMessage').textContent=message;
  document.querySelector('#accountBar').hidden=true;
}
async function hydrate(body){
  const result=structuredClone(body);
  for(const r of result.recipes){
    r.image='';
    if(r.imagePath){
      if(!imageCache.has(r.imagePath)){
        const {data,error}=await cloud.storage.from('kitchen-images').download(r.imagePath);
        if(error)throw Error('图片同步失败，请检查网络与存储权限');
        imageCache.set(r.imagePath,URL.createObjectURL(data));
      }
      r.image=imageCache.get(r.imagePath);
    }
  }
  return result;
}
function editorBusy(){return !!document.querySelector('dialog[open]')||document.querySelector('#pantryInput').value.trim();}
async function refreshCloud(force=false){
  if(syncing||saving||(!force&&editorBusy()))return;
  syncing=true;const epoch=sessionEpoch;
  try{
    const {data,error}=await cloud.from('kitchen_state').select('body,revision').eq('id',1).single();
    if(error){
      if(error.code==='PGRST116'||error.code==='42501')lockKitchen('此账号暂时无法访问家庭数据，请管理员检查成员名单。');
      throw Error('无法读取家庭数据。请检查账号是否加入 family_members，以及数据库是否已初始化。');
    }
    if(!loaded||data.revision!==revision){
      const next=await hydrate(data.body);
      if(epoch!==sessionEpoch)return;
      // An editor opened while images were loading: never replace its base revision.
      if(loaded&&!force&&editorBusy())return;
      state=next;revision=data.revision;loaded=true;render();
      if(view==='random')shuffle();
    }
    statusText('已同步 · '+new Date().toLocaleTimeString('zh-CN'));
  }catch(e){statusText('同步失败，可稍后重试');if(force)throw e;}
  finally{syncing=false;}
}
async function cloudSave(next){
  if(!loaded||saving||syncing){toast('正在同步，请稍候再保存');return false;}
  saving=true;const epoch=sessionEpoch;
  try{
    const body=structuredClone(next);
    for(const r of body.recipes){
      if(r.image?.startsWith('data:image/')){
        const blob=await (await fetch(r.image)).blob();
        if(blob.size>5*1024*1024)throw Error('单张图片不能超过 5MB');
        const suffix={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[blob.type];
        if(!suffix)throw Error('图片格式不支持');
        const path='family/'+crypto.randomUUID()+'.'+suffix;
        const {error}=await cloud.storage.from('kitchen-images').upload(path,blob,{contentType:blob.type,upsert:false});
        if(error)throw Error('图片上传失败：'+error.message);
        r.imagePath=path;
      }
      delete r.image;
    }
    const {data,error}=await cloud.rpc('save_kitchen',{expected_revision:revision,new_body:body});
    if(error){
      if(error.message.includes('revision_conflict'))throw Error('家人刚刚更新了菜谱，本次未覆盖。请复制未保存内容，关闭编辑框后点击“同步”，再重新编辑。');
      throw Error('云端保存失败：'+error.message);
    }
    if(epoch!==sessionEpoch)return false;
    // Commit is already confirmed. Image failures must not invite duplicate submission.
    revision=data;state={...next,recipes:body.recipes.map((r,i)=>({...r,image:next.recipes[i].image||''}))};
    statusText('已保存到家庭云端');
    return true;
  }catch(e){toast(e.message);return false;}finally{saving=false;}
}
async function exportCloud(){
  if(!loaded){toast('请先登录并同步');return;}
  try{
    const backup=structuredClone(state);
    for(const r of backup.recipes){
      if(r.imagePath){
        const {data,error}=await cloud.storage.from('kitchen-images').download(r.imagePath);
        if(error)throw error;
        r.image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(data);});
      }
      delete r.imagePath;
    }
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='煎包今天做什么-家庭备份.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{toast('备份失败，请检查网络后重试');}
}
async function enterKitchen(session){
  if(!session){lockKitchen();return;}
  try{
    await refreshCloud(true);
    if(!loaded)return;
    document.querySelector('#authPanel').hidden=true;
    document.querySelector('#familyApp').hidden=false;
    document.querySelector('#accountBar').hidden=false;
    document.querySelector('#userEmail').textContent=session.user.email;
    clearInterval(poll);poll=setInterval(()=>{if(!document.hidden)refreshCloud();},15000);
  }catch(e){lockKitchen(e.message);}
}
async function initCloud(){
  document.querySelector('#loginForm').onsubmit=e=>e.preventDefault();
  lockKitchen();
  const cfg=window.KITCHEN_CONFIG||{};
  if(!cfg.supabaseUrl||!cfg.supabaseKey){
    document.querySelector('#authMessage').textContent='还差最后一步：按配置教程创建 Supabase 项目，并填写 config.js 中的两个公开连接信息。';
    document.querySelector('#loginButton').disabled=true;return;
  }
  if(!window.supabase){document.querySelector('#authMessage').textContent='云端组件未加载，请检查网络后刷新。';return;}
  try{cloud=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);}catch(e){lockKitchen('登录组件初始化失败：'+e.message);return;}
  cloud.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||!session)lockKitchen();});
  document.querySelector('#loginForm').onsubmit=async e=>{
    e.preventDefault();const button=document.querySelector('#loginButton');button.disabled=true;
    document.querySelector('#authMessage').textContent='正在登录…';
    try{
      const {data,error}=await cloud.auth.signInWithPassword({email:document.querySelector('#loginEmail').value.trim(),password:document.querySelector('#loginPassword').value});
      if(error)throw Error('登录失败，请检查邮箱、密码和网络。');
      document.querySelector('#loginPassword').value='';await enterKitchen(data.session);
    }catch(e){document.querySelector('#authMessage').textContent=e.message;}finally{button.disabled=false;}
  };
  document.querySelector('#logout').onclick=async()=>{
    if(saving){toast('正在保存，请稍候退出');return;}
    const {error}=await cloud.auth.signOut({scope:'local'});
    if(error){toast('退出失败，请重试');return;}lockKitchen();
  };
  document.querySelector('#syncNow').onclick=async()=>{
    if(editorBusy()){toast('请先保存或关闭编辑框，并清空未提交的食材输入');return;}
    try{await refreshCloud(true);}catch(e){toast(e.message);}
  };
  document.querySelector('#addExamples').onclick=async()=>{
    if(!loaded||state.recipes.length){toast('示例仅可在菜谱为空时导入');return;}
    try{const response=await fetch('./seed.json');if(!response.ok)throw Error();const seed=await response.json();if(await cloudSave({...state,recipes:seed.recipes})){render();toast('已导入六道示例菜');}}catch{toast('示例读取失败');}
  };
  const {data,error}=await cloud.auth.getSession();
  if(error){lockKitchen('登录状态读取失败，请重新登录');return;}
  if(data.session)await enterKitchen(data.session);
}
