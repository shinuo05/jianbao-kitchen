const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={recipes:[],pantry:[]},category='全部',view='recipes',editing=null,photo='',photoBusy=false;
let revision=0, loaded=false, saving=false;
function valid(s){return s&&Array.isArray(s.pantry)&&s.pantry.every(x=>typeof x==='string')&&Array.isArray(s.recipes)&&s.recipes.every(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&['荤菜','素菜','主食'].includes(r.category)&&typeof r.ingredients==='string'&&r.ingredients.trim()&&typeof r.steps==='string'&&typeof r.seasonings==='string'&&Number.isFinite(+r.minutes)&&+r.minutes>0&&(!r.image||/^data:image\/(jpeg|png|webp);base64,/.test(r.image)));}
async function save(next){return cloudSave(next);}
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').style.display='none',3500);}
const aliases={'西红柿':'番茄','马铃薯':'土豆','蒜':'大蒜','蒜瓣':'大蒜','大米饭':'米饭'};
function norm(s){s=s.trim().replace(/\s+.*$/,'').replace(/[0-9０-９]+(?:\.[0-9]+)?(?:克|千克|公斤|斤|个|颗|根|把|碗|袋|盒|升|毫升|g|kg|ml|L)?$/,'').replace(/[一二三四五六七八九十半两]+(?:克|千克|公斤|斤|个|颗|根|把|碗|袋|盒|升|毫升)$/,'').trim();return aliases[s]||s;}
function ingredients(r){return r.ingredients.split(/[\n，,、]+/).map(x=>x.trim()).filter(Boolean);}
function missing(r){const p=new Set(state.pantry.filter(name=>{const days=fridgeDays(fridgeInfo(name).expires);return days===null||days>=0;}).map(norm));return ingredients(r).filter(x=>!p.has(norm(x)));}
function card(r){const m=missing(r);return `<article class="card" tabindex="0" role="button" data-id="${esc(r.id)}" aria-label="查看${esc(r.name)}"><div class="cover">${r.image?`<img src="${esc(r.image)}" alt="${esc(r.name)}">`:esc(r.emoji||({'荤菜':'🥘','素菜':'🥬','主食':'🍚'}[r.category]))}<span class="category">${esc(r.category)}</span></div><div class="card-body"><div class="meta"><h3>${esc(r.name)}</h3><span>◷ ${esc(r.minutes)} 分钟</span></div><div class="ingredients">${ingredients(r).map(x=>esc(norm(x))).join(' · ')}</div><div class="card-foot"><span>${m.length?`<b>还缺 ${m.length} 种食材</b>`:'✓ 食材齐全，可以开做'}</span><span>查看做法 ↗</span></div></div></article>`;}
function renderRecipes(){const q=$('#search').value.trim();const list=state.recipes.filter(r=>(category==='全部'||r.category===category)&&(!q||(r.name+r.ingredients).includes(q))&&(!$('#ready').checked||!missing(r).length));$('#count').textContent=state.recipes.length+' 道';$('#cards').innerHTML=list.map(card).join('')||'<div class="empty">还没有匹配的菜谱，试试其他食材或添加一道新菜吧。</div>';$('#pantryTags').innerHTML=state.pantry.map((x,i)=>`<button data-remove="${i}" aria-label="移除${esc(x)}">${esc(x)} ×</button>`).join('')||'<p class="hint">冰箱还是空的，先添加一些食材吧。</p>';}
function setView(v){view=v;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('#pantryPanel').hidden=v!=='pantry';$('#randomPanel').hidden=v!=='random';$('#recipePanel').hidden=v==='random';$('#sectionTitle').innerHTML=({recipes:'我的私房菜谱',pantry:'打开冰箱，看看能做什么',random:'今天这顿，就这么定了'}[v])+' <span id="count"></span>';$('#sectionLabel').textContent={recipes:'MY RECIPE COLLECTION',pantry:'FROM YOUR FRIDGE',random:'A LITTLE DINNER INSPIRATION'}[v];if(v==='random')shuffle();render();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{category=b.dataset.cat;document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x===b));render();});$('#search').oninput=render;$('#ready').onchange=render;$('#heroRandom').onclick=()=>{setView('random');$('.workspace').scrollIntoView({behavior:'smooth'});};
$('#pantryForm').onsubmit=async e=>{e.preventDefault();const added=$('#pantryInput').value.split(/[\n,，、]+/).map(norm).filter(Boolean);if(await save({...state,pantry:[...new Set([...state.pantry,...added])]})){$('#pantryInput').value='';render();toast('食材已加入冰箱');}};$('#pantryTags').onclick=async e=>{const b=e.target.closest('[data-remove]');if(b&&await save({...state,pantry:state.pantry.filter((_,i)=>i!==+b.dataset.remove)}))render();};
function shuffle(){$('#randomResult').innerHTML=['荤菜','素菜','主食'].map(c=>{const pool=state.recipes.filter(r=>r.category===c&&(!$('#onlyReady').checked||!missing(r).length));const r=pool[Math.floor(Math.random()*pool.length)];return `<div><div class="random-label">${c} · ${c==='荤菜'?'来点满足':c==='素菜'?'清爽一点':'好好吃饱'}</div>${r?card(r):'<div class="empty">没有符合条件的'+c+'，添加菜谱或补充食材后再试。</div>'}</div>`;}).join('');}$('#shuffle').onclick=shuffle;$('#onlyReady').onchange=shuffle;
function openEditor(r){editing=r?.id||null;photo=r?.image||'';$('#recipeForm').reset();$('#editTitle').textContent=r?'编辑这道菜':'添加一道拿手菜';if(r)for(const k of ['name','category','minutes','ingredients','seasonings','steps'])$('#recipeForm').elements[k].value=r[k];$('#photoPreview').src=photo;$('#photoPreview').hidden=!photo;$('#editor').showModal();}$('#add').onclick=()=>openEditor();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
$('#photo').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>20*1024*1024){toast('请选择 20MB 以内的图片');return;}photoBusy=true;try{const bitmap=await createImageBitmap(f);const canvas=document.createElement('canvas');const scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);photo=canvas.toDataURL('image/jpeg',.8);bitmap.close();$('#photoPreview').src=photo;$('#photoPreview').hidden=false;}catch{toast('无法读取此图片，请尝试 JPG 或 PNG');}finally{photoBusy=false;}};
$('#recipeForm').onsubmit=async e=>{e.preventDefault();if(photoBusy){toast('图片处理中，请稍候');return;}const f=new FormData(e.target);const r={id:editing||crypto.randomUUID(),name:f.get('name').trim(),category:f.get('category'),minutes:+f.get('minutes'),ingredients:f.get('ingredients').trim(),seasonings:f.get('seasonings').trim(),steps:f.get('steps').trim(),image:photo,...(editing&&state.recipes.find(x=>x.id===editing)?.imagePath?{imagePath:state.recipes.find(x=>x.id===editing).imagePath}:{})};if(!r.name||!r.ingredients){toast('请填写菜名和主要食材');return;}const recipes=editing?state.recipes.map(x=>x.id===editing?r:x):[r,...state.recipes];if(await save({...state,recipes})){$('#editor').close();render();if(view==='random')shuffle();toast('菜谱已保存');}};
function detail(id){const r=state.recipes.find(x=>x.id===id);if(!r)return;const m=missing(r);$('#detailContent').innerHTML=`<div class="dialog-head"><h2>${esc(r.name)}</h2><button id="closeDetail" aria-label="关闭">×</button></div>${r.image?`<img class="detail-image" src="${esc(r.image)}" alt="${esc(r.name)}">`:`<div class="detail-emoji">${esc(r.emoji||'🍽️')}</div>`}<p class="meta">${esc(r.category)} · ${esc(r.minutes)} 分钟</p><h3>准备食材</h3><ul>${ingredients(r).map(x=>`<li>${esc(x)} ${m.includes(x)?'<small style="color:#aa8d5d">（家里还没有）</small>':'✓'}</li>`).join('')}</ul><p>调味料：${esc(r.seasonings||'未填写')}</p><h3>一起做饭吧</h3>${r.steps?`<ol>${r.steps.split('\n').filter(Boolean).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:'<p>还没有填写做法，可以编辑补充。</p>'}<div class="detail-actions"><button id="editRecipe" class="primary">编辑菜谱</button><button id="deleteRecipe" class="danger">删除菜谱</button></div>`;$('#closeDetail').onclick=()=>$('#detail').close();$('#editRecipe').onclick=()=>{$('#detail').close();openEditor(r);};$('#deleteRecipe').onclick=async ()=>{if(confirm('确定删除「'+r.name+'」吗？')&&await save({...state,recipes:state.recipes.filter(x=>x.id!==id)})){$('#detail').close();render();if(view==='random')shuffle();toast('菜谱已删除');}};$('#detail').showModal();}
for(const selector of ['#cards','#randomResult']){$(selector).onclick=e=>{const c=e.target.closest('[data-id]');if(c)detail(c.dataset.id);};$(selector).onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-id]')){e.preventDefault();detail(e.target.dataset.id);}};}
$('#export').onclick=exportCloud;$('#import').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const incoming=JSON.parse(await f.text());if(!valid(incoming)||new Set(incoming.recipes.map(r=>r.id)).size!==incoming.recipes.length)throw Error();if(confirm('导入将替换当前菜谱和食材，是否继续？建议先导出备份。')&&await save(incoming)){render();if(view==='random')shuffle();toast('备份已导入');}}catch{toast('备份格式不正确，请选择本站导出的 JSON 文件');}finally{e.target.value='';}};

// Fridge metadata is kept alongside the original pantry list for old backup compatibility.
let fridgeFilter='all', fridgeEditing=null;
function fridgeDate(now=new Date()){
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
function validFridgeDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function fridgeDays(value,today=fridgeDate()){
  if(!validFridgeDate(value))return null;
  return Math.round((Date.parse(value+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
}
function fridgeInfo(name){
  const map=state.pantryInfo;
  const value=map&&typeof map==='object'&&Object.hasOwn(map,name)?map[name]:null;
  return {quantity:typeof value?.quantity==='string'?value.quantity.slice(0,60):'',expires:validFridgeDate(value?.expires)?value.expires:''};
}
function fridgeStatus(expires){
  const days=fridgeDays(expires);
  if(days===null)return {kind:'unset',label:'未设置到期日',days};
  if(days<0)return {kind:'expired',label:`已过期 ${-days} 天`,days};
  if(days===0)return {kind:'soon',label:'今天到期',days};
  if(days<=3)return {kind:'soon',label:`${days} 天后到期`,days};
  return {kind:'fresh',label:`还有 ${days} 天到期`,days};
}
function render(){renderRecipes();if($('#fridgeList'))renderFridge();}
function renderFridge(){
  const entries=state.pantry.map((name,index)=>({name,index,...fridgeInfo(name)}));
  const expired=entries.filter(x=>fridgeStatus(x.expires).kind==='expired').length;
  const soon=entries.filter(x=>fridgeStatus(x.expires).kind==='soon').length;
  $('#fridgeSummary').innerHTML=`<span>冰箱里有 <b>${entries.length}</b> 种食材</span><span>⏳ 临近到期 <b>${soon}</b></span><span>📅 已过期 <b>${expired}</b></span>`;
  const q=$('#fridgeSearch').value.trim();
  const filtered=entries.filter(x=>(!q||x.name.includes(q))&&(fridgeFilter==='all'||fridgeStatus(x.expires).kind===fridgeFilter));
  filtered.sort((a,b)=>(fridgeDays(a.expires)??Infinity)-(fridgeDays(b.expires)??Infinity)||a.index-b.index);
  $('#fridgeList').innerHTML=filtered.map(x=>{
    const status=fridgeStatus(x.expires);
    return `<article class="fridge-item ${status.kind}"><div class="fridge-item-top"><h3>${esc(x.name)}</h3><span class="expiry-badge">${status.label}</span></div><p class="fridge-quantity">库存：${esc(x.quantity||'未填写数量')}</p><p class="fridge-expiry">到期日期：${esc(x.expires||'未设置')}</p><div class="fridge-actions"><button type="button" data-stock-edit="${x.index}">✎ 修改</button><button type="button" data-stock-remove="${x.index}">用完 / 移除</button></div></article>`;
  }).join('')||`<div class="empty">${entries.length?'没有符合条件的食材。':'冰箱清单还是空的，点击“添加食材”记录第一样食材吧。'}</div>`;
}
function openStock(name=null){
  if(!loaded){toast('请先等待家庭数据同步');return;}
  fridgeEditing=name;
  $('#stockForm').reset();
  $('#stockTitle').textContent=name?'修改冰箱食材':'添加冰箱食材';
  $('#stockName').value=name||'';
  const info=name?fridgeInfo(name):{quantity:'',expires:''};
  $('#stockQuantity').value=info.quantity;$('#stockExpires').value=info.expires;
  updateStockPreview();$('#stockDialog').showModal();
}
function updateStockPreview(){
  $('#stockDateHint').textContent=$('#stockExpires').value?fridgeStatus($('#stockExpires').value).label:'可直接填写包装上的到期日期；不确定时可以留空。';
}
function stockUpdate(name,quantity,expires){
  if(fridgeEditing!==name&&state.pantry.some(x=>norm(x)===norm(name)))throw Error('冰箱里已有同名食材，请修改原来的记录。');
  const pantry=fridgeEditing?state.pantry.map(x=>x===fridgeEditing?name:x):[...state.pantry,name];
  const pantryInfo={...(state.pantryInfo||{})};
  if(fridgeEditing&&fridgeEditing!==name)delete pantryInfo[fridgeEditing];
  Object.defineProperty(pantryInfo,name,{value:{quantity,expires},enumerable:true,writable:true,configurable:true});
  return {...state,pantry,pantryInfo};
}
function setupFridge(){
  $('#pantryPanel').innerHTML=`<div class="fridge-intro"><p>打开冰箱，看看家里有什么。记录数量和到期日期，做饭前心里有数。</p><button id="addStock" class="primary" type="button">＋ 添加食材</button></div><div id="fridgeSummary" class="fridge-summary"></div><form id="pantryForm" class="inputrow"><input id="pantryInput" maxlength="500" placeholder="快速添加名称：鸡蛋、番茄、三文鱼" required><button class="button" type="submit">批量加入</button></form><div class="fridge-toolbar"><div class="fridge-filters"><button type="button" data-fridge-filter="all" class="selected">全部</button><button type="button" data-fridge-filter="soon">3 天内到期</button><button type="button" data-fridge-filter="expired">已过期</button><button type="button" data-fridge-filter="unset">未设日期</button></div><input id="fridgeSearch" placeholder="搜索冰箱里的食材" aria-label="搜索冰箱食材"></div><div id="fridgeList" class="fridge-list"></div><p class="hint fridge-hint">提醒按填写的日期计算，每种食材记录一个到期日。已过期的食材不计入“现有食材能做”的匹配；日期提醒不能代替对实际储存状况的判断。</p><div id="pantryTags" hidden></div><h3 class="fridge-recipe-title">用冰箱里的食材，做一顿饭 ↓</h3>`;
  const dialog=document.createElement('dialog');dialog.id='stockDialog';
  dialog.innerHTML=`<form id="stockForm"><div class="dialog-head"><h2 id="stockTitle">添加冰箱食材</h2><button type="button" id="closeStock" aria-label="关闭食材编辑">×</button></div><label>食材名称<input id="stockName" maxlength="100" placeholder="例如：鸡蛋" required></label><label>库存数量与单位<input id="stockQuantity" maxlength="60" placeholder="例如：6个、500克、半袋"></label><label>保质期（到期日期）<input id="stockExpires" type="date" min="2000-01-01" max="2100-12-31"></label><div class="date-shortcuts"><button type="button" data-expiry-days="3">3 天后</button><button type="button" data-expiry-days="7">7 天后</button><button type="button" data-expiry-days="30">30 天后</button><button type="button" id="clearExpiry">不设置</button></div><p id="stockDateHint" class="hint"></p><button type="submit" class="primary full">保存到家庭冰箱</button></form>`;
  document.body.appendChild(dialog);
  const style=document.createElement('style');style.textContent=`
  .fridge-intro{display:flex;align-items:center;justify-content:space-between;gap:15px}.fridge-intro p{margin:0}.fridge-summary{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.fridge-summary span{background:#e6f4fa;padding:12px 20px;border-radius:12px;color:#52778a}.fridge-summary span:nth-child(2){background:#fff0e6;color:#8a6847}.fridge-summary span:nth-child(3){background:#fbe6ed;color:#9b5672}.fridge-summary b{font-size:20px;margin:0 4px}.fridge-toolbar{display:flex;align-items:center;gap:15px;justify-content:space-between;margin:22px 0 15px}.fridge-filters{display:flex;gap:7px;flex-wrap:wrap}.fridge-filters button{padding:7px 13px;background:#fff;border:1px solid #e1e8ed}.fridge-filters button.selected{background:#48788b;color:#fff;border-color:#48788b}input#fridgeSearch{max-width:230px}.fridge-list{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.fridge-item{padding:20px;border:1px solid #deebf1;background:#ffffffdb;border-radius:16px}.fridge-item.soon{background:#fff8f1;border-color:#f0d9bb}.fridge-item.expired{background:#fff1f5;border-color:#efccd8}.fridge-item-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.fridge-item h3{margin:0;font-size:19px;overflow-wrap:anywhere}.expiry-badge{font-size:11px;border-radius:20px;padding:4px 9px;background:#e4f2f8;color:#52778a;white-space:nowrap}.soon .expiry-badge{background:#ffebcf;color:#8a5d24}.expired .expiry-badge{background:#f7d9e4;color:#9a4667}.fridge-item p{margin:10px 0!important;font-size:13px;color:#6c7b88!important}.fridge-actions{display:flex;gap:8px;margin-top:15px}.fridge-actions button{padding:6px 12px;font-size:12px}.fridge-hint{margin:18px 0 30px!important}.fridge-recipe-title{border-top:1px solid #e4e5ec;padding-top:20px;font-size:18px}.date-shortcuts{display:flex;flex-wrap:wrap;gap:8px;margin-top:-5px}.date-shortcuts button{font-size:12px;padding:6px 12px}@media(max-width:900px){.fridge-list{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.fridge-intro,.fridge-toolbar{align-items:stretch;flex-direction:column}.fridge-list{grid-template-columns:1fr}.fridge-summary{gap:7px}.fridge-summary span{padding:8px 11px;font-size:12px}input#fridgeSearch{max-width:none}}
  `;document.head.appendChild(style);
  $('#addStock').onclick=()=>openStock();$('#closeStock').onclick=()=>dialog.close();
  $('#stockExpires').oninput=updateStockPreview;
  $('#clearExpiry').onclick=()=>{$('#stockExpires').value='';updateStockPreview();};
  document.querySelectorAll('[data-expiry-days]').forEach(b=>b.onclick=()=>{const date=new Date();date.setDate(date.getDate()+Number(b.dataset.expiryDays));$('#stockExpires').value=fridgeDate(date);updateStockPreview();});
  document.querySelectorAll('[data-fridge-filter]').forEach(b=>b.onclick=()=>{fridgeFilter=b.dataset.fridgeFilter;document.querySelectorAll('[data-fridge-filter]').forEach(x=>x.classList.toggle('selected',x===b));renderFridge();});
  $('#fridgeSearch').oninput=renderFridge;
  $('#pantryForm').onsubmit=async e=>{
    e.preventDefault();const names=$('#pantryInput').value.split(/[\n,，、]+/).map(norm).filter(Boolean);
    if(names.some(x=>x.length>100)){toast('食材名称不能超过 100 个字');return;}
    if(await save({...state,pantry:[...new Set([...state.pantry,...names])]})){$('#pantryInput').value='';render();toast('已加入冰箱，点击“修改”补充数量和保质期');}
  };
  $('#stockForm').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('[type=submit]');
    const name=norm($('#stockName').value);const quantity=$('#stockQuantity').value.trim();const expires=$('#stockExpires').value;
    if(!name){toast('请填写食材名称');return;}
    if(expires&&!validFridgeDate(expires)){toast('请填写有效的到期日期');return;}
    try{const next=stockUpdate(name,quantity,expires);button.disabled=true;if(await save(next)){dialog.close();render();toast('冰箱记录已保存，家人也能看到');}}catch(error){toast(error.message);}finally{button.disabled=false;}
  };
  $('#fridgeList').onclick=async e=>{
    const edit=e.target.closest('[data-stock-edit]');if(edit){openStock(state.pantry[Number(edit.dataset.stockEdit)]);return;}
    const remove=e.target.closest('[data-stock-remove]');if(!remove)return;
    const name=state.pantry[Number(remove.dataset.stockRemove)];
    if(!confirm('将“'+name+'”从冰箱清单移除？'))return;
    const pantryInfo={...(state.pantryInfo||{})};delete pantryInfo[name];
    if(await save({...state,pantry:state.pantry.filter(x=>x!==name),pantryInfo})){render();toast('已从冰箱移除');}
  };
  // Recompute date reminders after local midnight even when data revision is unchanged.
  let lastDay=fridgeDate();setInterval(()=>{const day=fridgeDate();if(day!==lastDay){lastDay=day;render();}},60000);
}
setupFridge();
render();
initCloud();
