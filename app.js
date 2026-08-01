const cfg=window.APP_CONFIG||{};
const db=window.supabase.createClient(cfg.SUPABASE_URL||'',cfg.SUPABASE_PUBLISHABLE_KEY||'');
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let user=null,caregivers=[],houses=[],shifts=[],view='dashboard';

const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR=s=>s?new Date(s+'T12:00:00').toLocaleDateString('pt-BR'):'';
const monthNow=()=>new Date().toISOString().slice(0,7);
const labelType=v=>({fixed:'Fixo',support:'Suporte',both:'Fixo e suporte'}[v]||v);
const labelStatus=v=>({active:'Ativo',away:'Afastado',inactive:'Inativo',planned:'Previsto',completed:'Realizado',absence:'Falta',cancelled:'Cancelado'}[v]||v);
const badge=(text,kind='')=>`<span class="badge ${kind}">${text}</span>`;
function sync(t){$('#syncState').textContent=t}
function openModal(id){$('#'+id).classList.add('open')}
function closeModal(id){$('#'+id).classList.remove('open')}
$$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));

async function loadAll(){
  sync('Sincronizando...');
  const [cg,hs,sh]=await Promise.all([
    db.from('caregivers').select('*').order('name'),
    db.from('houses').select('*').order('name'),
    db.from('shifts').select('*').order('shift_date',{ascending:false})
  ]);
  for(const r of [cg,hs,sh]) if(r.error){sync('Erro');alert(r.error.message);return}
  caregivers=cg.data||[];houses=hs.data||[];shifts=sh.data||[];
  sync('Sincronizado');render();
}
function setView(v){
  view=v;$$('.view').forEach(x=>x.classList.remove('active'));$('#'+v+'View').classList.add('active');
  $$('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  const titles={dashboard:'Dashboard',caregivers:'Cuidadores',houses:'Casas',shifts:'Plantões',closing:'Fechamento mensal'};
  $('#pageTitle').textContent=titles[v];render();
}
$$('.nav button').forEach(b=>b.onclick=()=>setView(b.dataset.view));

function render(){
  $('#dashCaregivers').textContent=caregivers.filter(x=>x.status==='active').length;
  $('#dashSupport').textContent=caregivers.filter(x=>x.status==='active'&&['support','both'].includes(x.work_type)).length;
  $('#dashHouses').textContent=houses.filter(x=>x.status==='active').length;
  const month=monthNow();$('#dashShifts').textContent=shifts.filter(x=>x.shift_date.startsWith(month)).length;
  const today=new Date().toISOString().slice(0,10), todays=shifts.filter(x=>x.shift_date===today);
  $('#todayShifts').innerHTML=todays.length?todays.map(x=>`<p><strong>${houseName(x.house_id)}</strong> — ${caregiverName(x.actual_caregiver_id)} (${x.turn})</p>`).join(''):'<div class="empty">Nenhum plantão hoje.</div>';
  const completed=shifts.filter(x=>x.shift_date.startsWith(month)&&x.status==='completed');
  $('#monthSummary').innerHTML=`<p>Realizados: <strong>${completed.length}</strong></p><p>Valor estimado: <strong>${money(completed.reduce((a,b)=>a+Number(b.amount||0),0))}</strong></p>`;
  renderCaregivers();renderHouses();renderShifts();renderClosing();
}
function caregiverName(id){return caregivers.find(x=>x.id===id)?.name||'-'}
function houseName(id){return houses.find(x=>x.id===id)?.name||'-'}

function renderCaregivers(){
  const q=$('#caregiverSearch').value.toLowerCase();
  const list=caregivers.filter(x=>x.name.toLowerCase().includes(q)||(x.cpf||'').includes(q));
  $('#caregiversBody').innerHTML=list.length?list.map(x=>`<tr>
    <td>${x.name}</td><td>${x.cpf||''}</td><td>${labelType(x.work_type)}</td><td>${x.phone||''}</td><td>${x.pix_key||''}</td>
    <td>${x.has_mei?badge('Sim','ok'):badge('Não')}</td><td>${badge(labelStatus(x.status),x.status==='active'?'ok':'warn')}</td>
    <td><button class="btn" onclick="editCaregiver('${x.id}')">Editar</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">Nenhum cuidador.</td></tr>';
}
$('#caregiverSearch').oninput=renderCaregivers;
$('#newCaregiverBtn').onclick=()=>editCaregiver();
window.editCaregiver=id=>{
  const x=caregivers.find(a=>a.id===id);
  $('#caregiverId').value=x?.id||'';$('#cgName').value=x?.name||'';$('#cgCpf').value=x?.cpf||'';$('#cgPhone').value=x?.phone||'';
  $('#cgType').value=x?.work_type||'fixed';$('#cgRole').value=x?.role||'';$('#cgPix').value=x?.pix_key||'';
  $('#cgMei').value=String(x?.has_mei||false);$('#cgCnpj').value=x?.cnpj||'';$('#cgStatus').value=x?.status||'active';$('#cgNotes').value=x?.notes||'';
  $('#deleteCaregiverBtn').style.display=id?'inline-block':'none';openModal('caregiverModal');
};
$('#caregiverForm').onsubmit=async e=>{
  e.preventDefault();const id=$('#caregiverId').value,p={name:$('#cgName').value.trim(),cpf:$('#cgCpf').value.trim()||null,phone:$('#cgPhone').value.trim()||null,work_type:$('#cgType').value,role:$('#cgRole').value.trim()||null,pix_key:$('#cgPix').value.trim()||null,has_mei:$('#cgMei').value==='true',cnpj:$('#cgCnpj').value.trim()||null,status:$('#cgStatus').value,notes:$('#cgNotes').value.trim()||null,updated_at:new Date().toISOString()};
  const r=id?await db.from('caregivers').update(p).eq('id',id):await db.from('caregivers').insert({...p,created_by:user.id});
  if(r.error)return alert(r.error.message);closeModal('caregiverModal');loadAll();
};
$('#deleteCaregiverBtn').onclick=async()=>{const id=$('#caregiverId').value;if(confirm('Excluir cuidador?')){const r=await db.from('caregivers').delete().eq('id',id);if(r.error)return alert(r.error.message);closeModal('caregiverModal');loadAll()}};

function renderHouses(){
  const q=$('#houseSearch').value.toLowerCase();const list=houses.filter(x=>x.name.toLowerCase().includes(q)||(x.code||'').toLowerCase().includes(q));
  $('#housesBody').innerHTML=list.length?list.map(x=>`<tr><td>${x.name}</td><td>${x.code||''}</td><td>${x.responsible_name||''}</td><td>${x.phone||''}</td><td>${x.coverage_type||''}</td><td>${badge(labelStatus(x.status),x.status==='active'?'ok':'warn')}</td><td><button class="btn" onclick="editHouse('${x.id}')">Editar</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhuma casa.</td></tr>';
}
$('#houseSearch').oninput=renderHouses;$('#newHouseBtn').onclick=()=>editHouse();
window.editHouse=id=>{const x=houses.find(a=>a.id===id);$('#houseId').value=x?.id||'';$('#hsName').value=x?.name||'';$('#hsCode').value=x?.code||'';$('#hsResponsible').value=x?.responsible_name||'';$('#hsPhone').value=x?.phone||'';$('#hsCoverage').value=x?.coverage_type||'12h';$('#hsStatus').value=x?.status||'active';$('#hsAddress').value=x?.address||'';$('#hsNotes').value=x?.notes||'';$('#deleteHouseBtn').style.display=id?'inline-block':'none';openModal('houseModal')};
$('#houseForm').onsubmit=async e=>{e.preventDefault();const id=$('#houseId').value,p={name:$('#hsName').value.trim(),code:$('#hsCode').value.trim()||null,responsible_name:$('#hsResponsible').value.trim()||null,phone:$('#hsPhone').value.trim()||null,coverage_type:$('#hsCoverage').value,status:$('#hsStatus').value,address:$('#hsAddress').value.trim()||null,notes:$('#hsNotes').value.trim()||null,updated_at:new Date().toISOString()};const r=id?await db.from('houses').update(p).eq('id',id):await db.from('houses').insert({...p,created_by:user.id});if(r.error)return alert(r.error.message);closeModal('houseModal');loadAll()};
$('#deleteHouseBtn').onclick=async()=>{const id=$('#houseId').value;if(confirm('Excluir casa?')){const r=await db.from('houses').delete().eq('id',id);if(r.error)return alert(r.error.message);closeModal('houseModal');loadAll()}};

function fillShiftSelects(){
  const hs=houses.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  const cg=caregivers.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  $('#shHouse').innerHTML=hs;$('#shPlanned').innerHTML='<option value="">Não informado</option>'+cg;$('#shActual').innerHTML=cg;
}
function renderShifts(){
  const m=$('#shiftMonth').value||monthNow(),list=shifts.filter(x=>x.shift_date.startsWith(m));
  $('#shiftsBody').innerHTML=list.length?list.map(x=>`<tr><td>${dateBR(x.shift_date)}</td><td>${houseName(x.house_id)}</td><td>${caregiverName(x.planned_caregiver_id)}</td><td>${caregiverName(x.actual_caregiver_id)}</td><td>${x.turn}</td><td>${x.shift_type}</td><td>${money(x.amount)}</td><td>${badge(labelStatus(x.status),x.status==='completed'?'ok':x.status==='absence'?'danger':'warn')}</td><td><button class="btn" onclick="editShift('${x.id}')">Editar</button></td></tr>`).join(''):'<tr><td colspan="9" class="empty">Nenhum plantão no período.</td></tr>';
}
$('#shiftMonth').value=monthNow();$('#shiftMonth').onchange=renderShifts;$('#newShiftBtn').onclick=()=>editShift();
window.editShift=id=>{fillShiftSelects();const x=shifts.find(a=>a.id===id);$('#shiftId').value=x?.id||'';$('#shDate').value=x?.shift_date||new Date().toISOString().slice(0,10);$('#shHouse').value=x?.house_id||$('#shHouse').value;$('#shPlanned').value=x?.planned_caregiver_id||'';$('#shActual').value=x?.actual_caregiver_id||$('#shActual').value;$('#shTurn').value=x?.turn||'day';$('#shType').value=x?.shift_type||'normal';$('#shValue').value=x?.amount||'';$('#shStatus').value=x?.status||'planned';$('#shNotes').value=x?.notes||'';$('#deleteShiftBtn').style.display=id?'inline-block':'none';openModal('shiftModal')};
$('#shiftForm').onsubmit=async e=>{e.preventDefault();const id=$('#shiftId').value,p={shift_date:$('#shDate').value,house_id:$('#shHouse').value,planned_caregiver_id:$('#shPlanned').value||null,actual_caregiver_id:$('#shActual').value,turn:$('#shTurn').value,shift_type:$('#shType').value,amount:Number($('#shValue').value),status:$('#shStatus').value,notes:$('#shNotes').value.trim()||null,updated_at:new Date().toISOString()};const r=id?await db.from('shifts').update(p).eq('id',id):await db.from('shifts').insert({...p,created_by:user.id});if(r.error)return alert(r.error.message);closeModal('shiftModal');loadAll()};
$('#deleteShiftBtn').onclick=async()=>{const id=$('#shiftId').value;if(confirm('Excluir plantão?')){const r=await db.from('shifts').delete().eq('id',id);if(r.error)return alert(r.error.message);closeModal('shiftModal');loadAll()}};

function renderClosing(){
  const m=$('#closingMonth').value||monthNow(),list=shifts.filter(x=>x.shift_date.startsWith(m)&&x.status==='completed');
  const map={};for(const s of list){const id=s.actual_caregiver_id;if(!map[id])map[id]={day:0,night:0,h24:0,support:0,extra:0,total:0};if(s.turn==='day')map[id].day++;if(s.turn==='night')map[id].night++;if(s.turn==='24h')map[id].h24++;if(s.shift_type==='support')map[id].support++;if(s.shift_type==='extra')map[id].extra++;map[id].total+=Number(s.amount||0)}
  const rows=Object.entries(map);
  $('#closingBody').innerHTML=rows.length?rows.map(([id,x])=>`<tr><td>${caregiverName(id)}</td><td>${x.day}</td><td>${x.night}</td><td>${x.h24}</td><td>${x.support}</td><td>${x.extra}</td><td><strong>${money(x.total)}</strong></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum plantão realizado no período.</td></tr>';
}
$('#closingMonth').value=monthNow();$('#closingMonth').onchange=renderClosing;$('#refreshClosingBtn').onclick=renderClosing;

$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginMsg').textContent='Entrando...';const {error}=await db.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});$('#loginMsg').textContent=error?error.message:''};
$('#logoutBtn').onclick=()=>db.auth.signOut();
async function applySession(s){user=s?.user||null;if(user){$('#authScreen').classList.add('hidden');$('#appRoot').classList.remove('hidden');await loadAll()}else{$('#appRoot').classList.add('hidden');$('#authScreen').classList.remove('hidden')}}
db.auth.onAuthStateChange((_,s)=>applySession(s));db.auth.getSession().then(({data})=>applySession(data.session));
