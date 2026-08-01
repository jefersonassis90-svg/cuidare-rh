const cfg=window.APP_CONFIG||{};
const db=window.supabase.createClient(cfg.SUPABASE_URL||'',cfg.SUPABASE_PUBLISHABLE_KEY||'');
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
let user=null,caregivers=[],houses=[],assignments=[],shifts=[],view='dashboard';

const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const moneyToNumber=v=>window.Masks?.moneyToNumber(v)||Number(v||0);
const dateBR=s=>s?new Date(s+'T12:00:00').toLocaleDateString('pt-BR'):'';
const monthNow=()=>new Date().toISOString().slice(0,7);
const todayISO=()=>new Date().toISOString().slice(0,10);
const labelType=v=>({fixed:'Fixo',support:'Suporte',both:'Fixo e suporte'}[v]||v);
const labelStatus=v=>({active:'Ativo',away:'Afastado',inactive:'Inativo',planned:'Previsto',completed:'Realizado',absence:'Falta',cancelled:'Cancelado'}[v]||v);
const labelTurn=v=>({day:'Diurno',night:'Noturno','24h':'24 horas'}[v]||v);
const labelSchedule=v=>({'12x36':'12x36',daily:'Todos os dias',weekdays:'Dias da semana'}[v]||v);
const badge=(text,kind='')=>`<span class="badge ${kind}">${text}</span>`;
const sync=t=>$('#syncState').textContent=t;
const caregiverName=id=>caregivers.find(x=>x.id===id)?.name||'-';
const houseName=id=>houses.find(x=>x.id===id)?.name||'-';
const openModal=id=>$('#'+id).classList.add('open');
const closeModal=id=>$('#'+id).classList.remove('open');
$$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));

async function loadAll(){
  sync('Sincronizando...');
  const [cg,hs,as,sh]=await Promise.all([
    db.from('caregivers').select('*').order('name'),
    db.from('houses').select('*').order('name'),
    db.from('caregiver_house_assignments').select('*').order('created_at'),
    db.from('shifts').select('*').order('shift_date',{ascending:false})
  ]);
  for(const r of [cg,hs,as,sh])if(r.error){sync('Erro');alert(r.error.message);return}
  caregivers=cg.data||[];houses=hs.data||[];assignments=as.data||[];shifts=sh.data||[];
  sync('Sincronizado');render();
}

function setView(v){
  view=v;$$('.view').forEach(x=>x.classList.remove('active'));$('#'+v+'View').classList.add('active');
  $$('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $('#pageTitle').textContent={dashboard:'Dashboard',caregivers:'Cuidadores',houses:'Casas e escalas',supports:'Suportes',closing:'Fechamento mensal',receipts:'Recibos'}[v];
  if(v==='receipts'&&$('#closingMonth')?.value){
    $('#receiptMonth').value=$('#closingMonth').value;
  }
  render();
}
$$('.nav button').forEach(b=>b.onclick=()=>setView(b.dataset.view));

function render(){
  const month=monthNow(),monthSupports=shifts.filter(x=>x.shift_date.startsWith(month)&&x.shift_type==='support');
  $('#dashCaregivers').textContent=caregivers.filter(x=>x.status==='active').length;
  $('#dashSupport').textContent=caregivers.filter(x=>x.status==='active'&&['support','both'].includes(x.work_type)).length;
  $('#dashAssignments').textContent=assignments.filter(x=>x.status==='active').length;
  $('#dashMonthSupports').textContent=monthSupports.length;
  const todays=shifts.filter(x=>x.shift_date===todayISO());
  $('#todayShifts').innerHTML=todays.length?todays.map(x=>`<p><strong>${houseName(x.house_id)}</strong> — previsto: ${caregiverName(x.planned_caregiver_id)}${x.shift_type==='support'?` · suporte: ${caregiverName(x.actual_caregiver_id)}`:''} (${labelTurn(x.turn)})</p>`).join(''):'<div class="empty">Nenhuma escala gerada para hoje.</div>';
  const monthShifts=shifts.filter(x=>x.shift_date.startsWith(month));
  $('#monthSummary').innerHTML=`<p>Plantões previstos: <strong>${monthShifts.length}</strong></p><p>Substituições por suporte: <strong>${monthSupports.length}</strong></p><p>Folha estimada até hoje: <strong>${money(calculateClosing(month).reduce((a,b)=>a+b.total,0))}</strong></p>`;
  renderCaregivers();renderHouses();renderAssignments();renderSupports();renderClosing();renderReceipts();
}

function renderCaregivers(){
  const q=$('#caregiverSearch').value.toLowerCase();
  const list=caregivers.filter(x=>x.name.toLowerCase().includes(q)||(x.cpf||'').includes(q));
  $('#caregiversBody').innerHTML=list.length?list.map(x=>`<tr><td>${x.name}</td><td>${x.cpf||''}</td><td>${labelType(x.work_type)}</td><td>${x.phone||''}</td><td>${x.pix_key||''}</td><td>${x.has_mei?badge('Sim','ok'):badge('Não')}</td><td>${badge(labelStatus(x.status),x.status==='active'?'ok':'warn')}</td><td><button class="btn small" onclick="editCaregiver('${x.id}')">Editar</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">Nenhum cuidador.</td></tr>';
}
$('#caregiverSearch').oninput=renderCaregivers;
$('#cgPixType').onchange=()=>window.Masks.applyPixMask($('#cgPix'),$('#cgPixType').value);
$('#newCaregiverBtn').onclick=()=>editCaregiver();
window.editCaregiver=id=>{
  const x=caregivers.find(a=>a.id===id);
  $('#caregiverId').value=x?.id||'';$('#cgName').value=x?.name||'';$('#cgCpf').value=x?.cpf||'';$('#cgPhone').value=x?.phone||'';
  $('#cgType').value=x?.work_type||'fixed';$('#cgRole').value=x?.role||'';$('#cgPixType').value=x?.pix_type||'cpf';$('#cgPix').value=x?.pix_key||'';
  $('#cgMei').value=String(x?.has_mei||false);$('#cgCnpj').value=x?.cnpj||'';$('#cgStatus').value=x?.status||'active';$('#cgNotes').value=x?.notes||'';
  $('#deleteCaregiverBtn').style.display=id?'inline-block':'none';window.Masks.refresh();openModal('caregiverModal');
};
$('#caregiverForm').onsubmit=async e=>{
  e.preventDefault();const id=$('#caregiverId').value,p={name:$('#cgName').value.trim(),cpf:$('#cgCpf').value.trim()||null,phone:$('#cgPhone').value.trim()||null,work_type:$('#cgType').value,role:$('#cgRole').value.trim()||null,pix_type:$('#cgPixType').value,pix_key:$('#cgPix').value.trim()||null,has_mei:$('#cgMei').value==='true',cnpj:$('#cgCnpj').value.trim()||null,status:$('#cgStatus').value,notes:$('#cgNotes').value.trim()||null,updated_at:new Date().toISOString()};
  const r=id?await db.from('caregivers').update(p).eq('id',id):await db.from('caregivers').insert({...p,created_by:user.id});
  if(r.error)return alert(r.error.message);closeModal('caregiverModal');loadAll();
};
$('#deleteCaregiverBtn').onclick=async()=>{const id=$('#caregiverId').value;if(confirm('Excluir cuidador?')){const r=await db.from('caregivers').delete().eq('id',id);if(r.error)return alert(r.error.message);closeModal('caregiverModal');loadAll()}};

function renderHouses(){
  const q=$('#houseSearch').value.toLowerCase(),list=houses.filter(x=>x.name.toLowerCase().includes(q)||(x.code||'').toLowerCase().includes(q));
  $('#housesBody').innerHTML=list.length?list.map(x=>`<tr><td>${x.name}</td><td>${x.code||''}</td><td>${x.responsible_name||''}</td><td>${x.phone||''}</td><td>${x.coverage_type||''}</td><td>${badge(labelStatus(x.status),x.status==='active'?'ok':'warn')}</td><td><button class="btn small" onclick="editHouse('${x.id}')">Editar</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhuma casa.</td></tr>';
}
$('#houseSearch').oninput=renderHouses;$('#newHouseBtn').onclick=()=>editHouse();
window.editHouse=id=>{const x=houses.find(a=>a.id===id);$('#houseId').value=x?.id||'';$('#hsName').value=x?.name||'';$('#hsCode').value=x?.code||'';$('#hsResponsible').value=x?.responsible_name||'';$('#hsPhone').value=x?.phone||'';$('#hsCoverage').value=x?.coverage_type||'12h';$('#hsStatus').value=x?.status||'active';$('#hsCep').value=x?.cep||'';$('#hsAddress').value=x?.address||'';$('#hsNotes').value=x?.notes||'';$('#deleteHouseBtn').style.display=id?'inline-block':'none';window.Masks.refresh();openModal('houseModal')};
$('#houseForm').onsubmit=async e=>{e.preventDefault();const id=$('#houseId').value,p={name:$('#hsName').value.trim(),code:$('#hsCode').value.trim()||null,responsible_name:$('#hsResponsible').value.trim()||null,phone:$('#hsPhone').value.trim()||null,coverage_type:$('#hsCoverage').value,status:$('#hsStatus').value,cep:$('#hsCep').value.trim()||null,address:$('#hsAddress').value.trim()||null,notes:$('#hsNotes').value.trim()||null,updated_at:new Date().toISOString()};const r=id?await db.from('houses').update(p).eq('id',id):await db.from('houses').insert({...p,created_by:user.id});if(r.error)return alert(r.error.message);closeModal('houseModal');loadAll()};
$('#deleteHouseBtn').onclick=async()=>{const id=$('#houseId').value;if(confirm('Excluir casa?')){const r=await db.from('houses').delete().eq('id',id);if(r.error)return alert(r.error.message);closeModal('houseModal');loadAll()}};

function fillAssignmentSelects(){
  $('#asHouse').innerHTML=houses.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  $('#asCaregiver').innerHTML=caregivers.filter(x=>x.status==='active'&&['fixed','both'].includes(x.work_type)).map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
}
function selectedWeekdays(){return [...document.querySelectorAll('input[name="weekday"]:checked')].map(x=>Number(x.value))}
function setSelectedWeekdays(values=[]){document.querySelectorAll('input[name="weekday"]').forEach(x=>x.checked=values.includes(Number(x.value)))}
function renderAssignments(){
  $('#assignmentsBody').innerHTML=assignments.length?assignments.map(x=>`<tr><td>${houseName(x.house_id)}</td><td>${caregiverName(x.caregiver_id)}</td><td>${labelSchedule(x.schedule_type)}</td><td>${labelTurn(x.turn)}</td><td>${money(x.amount)}</td><td>${dateBR(x.start_date)}</td><td>${badge(labelStatus(x.status),x.status==='active'?'ok':'warn')}</td><td><button class="btn small" onclick="editAssignment('${x.id}')">Editar</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">Nenhuma escala fixa cadastrada.</td></tr>';
}
$('#assignmentMonth').value=monthNow();
$('#asScheduleType').onchange=()=>$('#weekdaysGroup').classList.toggle('hidden',$('#asScheduleType').value!=='weekdays');
$('#newAssignmentBtn').onclick=()=>editAssignment();
window.editAssignment=id=>{
  fillAssignmentSelects();const x=assignments.find(a=>a.id===id);
  $('#assignmentId').value=x?.id||'';$('#asHouse').value=x?.house_id||$('#asHouse').value;$('#asCaregiver').value=x?.caregiver_id||$('#asCaregiver').value;
  $('#asScheduleType').value=x?.schedule_type||'12x36';$('#asTurn').value=x?.turn||'day';$('#asAmount').value=x?window.Masks.formatMoneyFromNumber(x.amount):'';
  $('#asStartDate').value=x?.start_date||todayISO();$('#asEndDate').value=x?.end_date||'';$('#asStatus').value=x?.status||'active';$('#asNotes').value=x?.notes||'';
  setSelectedWeekdays(x?.weekdays||[]);$('#weekdaysGroup').classList.toggle('hidden',$('#asScheduleType').value!=='weekdays');
  $('#deleteAssignmentBtn').style.display=id?'inline-block':'none';window.Masks.refresh();openModal('assignmentModal');
};
$('#assignmentForm').onsubmit=async e=>{
  e.preventDefault();const id=$('#assignmentId').value,p={house_id:$('#asHouse').value,caregiver_id:$('#asCaregiver').value,schedule_type:$('#asScheduleType').value,turn:$('#asTurn').value,amount:moneyToNumber($('#asAmount').value),start_date:$('#asStartDate').value,end_date:$('#asEndDate').value||null,weekdays:selectedWeekdays(),status:$('#asStatus').value,notes:$('#asNotes').value.trim()||null,updated_at:new Date().toISOString()};
  if(p.schedule_type==='weekdays'&&!p.weekdays.length)return alert('Selecione pelo menos um dia da semana.');
  const r=id?await db.from('caregiver_house_assignments').update(p).eq('id',id).select().single():await db.from('caregiver_house_assignments').insert({...p,created_by:user.id}).select().single();
  if(r.error)return alert(r.error.message);
  await generateAssignmentShifts(r.data,$('#assignmentMonth').value||monthNow());
  closeModal('assignmentModal');loadAll();
};
$('#deleteAssignmentBtn').onclick=async()=>{const id=$('#assignmentId').value;if(confirm('Excluir vínculo? Os plantões já gerados permanecerão para histórico.')){const r=await db.from('caregiver_house_assignments').delete().eq('id',id);if(r.error)return alert(r.error.message);closeModal('assignmentModal');loadAll()}};
$('#generateAllBtn').onclick=async()=>{const m=$('#assignmentMonth').value||monthNow();for(const a of assignments.filter(x=>x.status==='active'))await generateAssignmentShifts(a,m);alert('Escalas geradas/atualizadas para o mês selecionado.');loadAll()};

function monthBounds(month){
  const [y,m]=month.split('-').map(Number),start=new Date(y,m-1,1),end=new Date(y,m,0);return{start,end}
}
function iso(d){return d.toISOString().slice(0,10)}
function shouldGenerate(a,d){
  const start=new Date(a.start_date+'T12:00:00'),end=a.end_date?new Date(a.end_date+'T12:00:00'):null;
  if(d<start||(end&&d>end))return false;
  if(a.schedule_type==='daily')return true;
  if(a.schedule_type==='weekdays')return (a.weekdays||[]).includes(d.getDay());
  if(a.schedule_type==='12x36'){const diff=Math.round((d-start)/(1000*60*60*24));return diff>=0&&diff%2===0}
  return false;
}
async function generateAssignmentShifts(a,month){
  const {start,end}=monthBounds(month),rows=[];
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    if(shouldGenerate(a,d))rows.push({assignment_id:a.id,shift_date:iso(d),house_id:a.house_id,planned_caregiver_id:a.caregiver_id,actual_caregiver_id:a.caregiver_id,turn:a.turn,shift_type:'normal',amount:a.amount,status:'planned',created_by:user.id,updated_at:new Date().toISOString()});
  }
  if(!rows.length)return;
  const r=await db.from('shifts').upsert(rows,{onConflict:'assignment_id,shift_date,turn',ignoreDuplicates:true});
  if(r.error)alert('Erro ao gerar escala: '+r.error.message);
}

function fillSupportSelects(){
  $('#spHouse').innerHTML=houses.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  $('#spSupportCaregiver').innerHTML=caregivers.filter(x=>x.status==='active'&&['support','both'].includes(x.work_type)).map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
}
async function locateFixedShift(){
  const date=$('#spDate').value,house=$('#spHouse').value,turn=$('#spTurn').value;
  if(!date||!house)return;
  const {data,error}=await db.from('shifts').select('*').eq('shift_date',date).eq('house_id',house).eq('turn',turn).maybeSingle();
  if(error)return alert(error.message);
  $('#supportShiftId').value=data?.id||'';$('#spFixedName').value=data?caregiverName(data.planned_caregiver_id):'Nenhuma escala fixa encontrada';
  if(data)$('#spAmount').value=window.Masks.formatMoneyFromNumber(data.amount);
}
['spDate','spHouse','spTurn'].forEach(id=>$('#'+id).onchange=locateFixedShift);
$('#supportMonth').value=monthNow();$('#supportMonth').onchange=renderSupports;
$('#newSupportBtn').onclick=()=>{fillSupportSelects();$('#supportShiftId').value='';$('#spDate').value=todayISO();$('#spTurn').value='day';$('#spReason').value='';$('#spNotes').value='';$('#spFixedName').value='';$('#spAmount').value='';window.Masks.refresh();openModal('supportModal');locateFixedShift()};
$('#supportForm').onsubmit=async e=>{
  e.preventDefault();const id=$('#supportShiftId').value;if(!id)return alert('Não existe escala fixa para esta casa, data e turno. Gere a escala da casa primeiro.');
  const original=shifts.find(x=>x.id===id);const reason=$('#spReason').value.trim(),notes=$('#spNotes').value.trim();
  const p={actual_caregiver_id:$('#spSupportCaregiver').value,shift_type:'support',amount:moneyToNumber($('#spAmount').value),status:'completed',notes:`Motivo do suporte: ${reason}${notes?` | ${notes}`:''}`,updated_at:new Date().toISOString()};
  const r=await db.from('shifts').update(p).eq('id',id);if(r.error)return alert(r.error.message);
  closeModal('supportModal');loadAll();
};
function renderSupports(){
  const m=$('#supportMonth').value||monthNow(),list=shifts.filter(x=>x.shift_date.startsWith(m)&&x.shift_type==='support');
  $('#supportsBody').innerHTML=list.length?list.map(x=>`<tr><td>${dateBR(x.shift_date)}</td><td>${houseName(x.house_id)}</td><td>${caregiverName(x.planned_caregiver_id)}</td><td>${caregiverName(x.actual_caregiver_id)}</td><td>${labelTurn(x.turn)}</td><td>${money(x.amount)}</td><td>${(x.notes||'').replace('Motivo do suporte: ','')}</td><td><button class="btn small" onclick="undoSupport('${x.id}')">Desfazer</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">Nenhum suporte registrado no período.</td></tr>';
}
window.undoSupport=async id=>{if(!confirm('Desfazer suporte e devolver o plantão ao cuidador fixo?'))return;const s=shifts.find(x=>x.id===id);const r=await db.from('shifts').update({actual_caregiver_id:s.planned_caregiver_id,shift_type:'normal',amount:assignments.find(a=>a.id===s.assignment_id)?.amount||s.amount,status:'planned',notes:null,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return alert(r.error.message);loadAll()};

function calculateClosing(month){
  const today=todayISO(),list=shifts.filter(x=>x.shift_date.startsWith(month)&&x.shift_date<=today&&!['cancelled','absence'].includes(x.status));
  const map={};
  for(const s of list){
    const id=s.actual_caregiver_id;if(!id)continue;
    if(!map[id])map[id]={caregiverId:id,h12:0,h24:0,count:0,total:0,houses:{}};
    const houseId=s.house_id;
    if(!map[id].houses[houseId])map[id].houses[houseId]={houseId,h12:0,h24:0,total:0};
    if(s.turn==='24h'){
      map[id].h24++;
      map[id].houses[houseId].h24++;
    }else{
      map[id].h12++;
      map[id].houses[houseId].h12++;
    }
    map[id].count++;
    map[id].total+=Number(s.amount||0);
    map[id].houses[houseId].total+=Number(s.amount||0);
  }
  return Object.values(map);
}
function renderClosing(){
  const month=$('#closingMonth').value||monthNow();
  const rows=calculateClosing(month);
  $('#closingBody').innerHTML=rows.length?rows.map(x=>`<tr>
    <td>${caregiverName(x.caregiverId)}</td>
    <td>${x.h12}</td>
    <td>${x.h24}</td>
    <td>${x.count}</td>
    <td><strong>${money(x.total)}</strong></td>
    <td><button class="btn small" onclick="generateReceipt('${x.caregiverId}','${month}')">Gerar recibo</button></td>
  </tr>`).join(''):'<tr><td colspan="6" class="empty">Nenhum plantão considerado no período.</td></tr>';
}
$('#closingMonth').value=monthNow();$('#closingMonth').onchange=()=>{renderClosing();$('#receiptMonth').value=$('#closingMonth').value;renderReceipts()};$('#refreshClosingBtn').onclick=renderClosing;

function monthPeriod(month){
  const [year,monthNumber]=month.split('-').map(Number);
  const lastDay=new Date(year,monthNumber,0).getDate();
  return{
    start:`01/${String(monthNumber).padStart(2,'0')}/${year}`,
    end:`${String(lastDay).padStart(2,'0')}/${String(monthNumber).padStart(2,'0')}/${year}`,
    label:new Date(year,monthNumber-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})
  };
}
function paymentMethodText(){
  return {pix:'PIX',transfer:'Transferência Bancária',cash:'Dinheiro'}[$('#receiptPaymentMethod')?.value]||'PIX';
}
function paymentCheckboxLine(){
  const selected=$('#receiptPaymentMethod')?.value||'pix';
  return `${selected==='pix'?'[X]':'[ ]'} PIX     ${selected==='transfer'?'[X]':'[ ]'} Transferência Bancária     ${selected==='cash'?'[X]':'[ ]'} Dinheiro`;
}
function receiptDocument(caregiverId,month,doc=null,addPage=false){
  if(!window.jspdf?.jsPDF)throw new Error('A biblioteca de PDF não foi carregada. Atualize a página com Ctrl + F5.');
  const row=calculateClosing(month).find(x=>x.caregiverId===caregiverId);
  const caregiver=caregivers.find(x=>x.id===caregiverId);
  if(!row||!caregiver)throw new Error('Não há fechamento para este cuidador no período.');

  const {jsPDF}=window.jspdf;
  const pdf=doc||new jsPDF({unit:'mm',format:'a4'});
  if(addPage)pdf.addPage();

  const period=monthPeriod(month);
  const paymentDate=$('#receiptPaymentDate').value?dateBR($('#receiptPaymentDate').value):'____/____/________';
  const isMei=Boolean(caregiver.has_mei&&caregiver.cnpj);
  const title=isMei?'RECIBO DE PAGAMENTO DA PRESTAÇÃO DE SERVIÇO - MEI':'RECIBO DE PAGAMENTO DA PRESTAÇÃO DE SERVIÇO';
  const cpf=caregiver.cpf||'Não informado';
  const cnpj=isMei?caregiver.cnpj:'Não se aplica';

  const left=18,right=192,width=174;
  pdf.setDrawColor(30,30,30);
  pdf.setLineWidth(.25);
  pdf.rect(12,12,186,273);

  pdf.setFont('helvetica','bold');
  pdf.setFontSize(14);
  pdf.text(title,105,23,{align:'center'});
  pdf.line(18,28,192,28);

  pdf.setFontSize(10.5);
  pdf.text('Empresa:',left,38);
  pdf.setFont('helvetica','normal');
  pdf.text('Cuidare Boa Viagem',37,38);
  pdf.setFont('helvetica','bold');
  pdf.text('CNPJ:',120,38);
  pdf.setFont('helvetica','normal');
  pdf.text('28.919.122/0001-03',136,38);

  pdf.setFont('helvetica','bold');pdf.text('Prestador:',left,47);
  pdf.setFont('helvetica','normal');pdf.text(caregiver.name,42,47);
  pdf.setFont('helvetica','bold');pdf.text('CPF:',left,56);
  pdf.setFont('helvetica','normal');pdf.text(cpf,31,56);
  pdf.setFont('helvetica','bold');pdf.text('CNPJ:',105,56);
  pdf.setFont('helvetica','normal');pdf.text(cnpj,121,56);
  pdf.setFont('helvetica','bold');pdf.text('Período de Serviço:',left,65);
  pdf.setFont('helvetica','normal');pdf.text(`${period.start} a ${period.end}`,60,65);

  pdf.setFont('helvetica','bold');pdf.text('Descrição do Serviço Prestado:',left,76);
  pdf.setFont('helvetica','normal');
  const desc='Cuidados domiciliares e plantões de assistência, conforme datas de prestação definidas pelo(a) cuidador(a).';
  pdf.text(pdf.splitTextToSize(desc,width),left,83);

  pdf.setFont('helvetica','bold');pdf.text('Valor Bruto da Prestação de Serviço:',left,101);
  pdf.setFontSize(12);pdf.text(money(row.total),92,101);

  pdf.setFont('helvetica','normal');pdf.setFontSize(10.5);
  const declaration=`Declaro, para os devidos fins, que recebi da empresa Cuidare Boa Viagem o valor acima descrito, referente a ${row.h12} plantão(ões) de 12 horas e ${row.h24} plantão(ões) de 24 horas, além dos deslocamentos, plantões alinhados e seus respectivos deslocamentos, serviços prestados conforme contrato de prestação de serviço firmado entre as partes.`;
  const declLines=pdf.splitTextToSize(declaration,width);
  pdf.text(declLines,left,114);

  let y=114+declLines.length*5+12;

  pdf.setFont('helvetica','bold');
  pdf.setFontSize(10.5);
  pdf.text(`Plantões de 12 horas: ${row.h12}`,left,y);
  pdf.text(`Plantões de 24 horas: ${row.h24}`,left,y+8);
  pdf.text(`Valor Total: ${money(row.total)}`,left,y+18);

  y+=32;
  pdf.setFont('helvetica','bold');pdf.setFontSize(10.5);
  pdf.text('Forma de Pagamento:',left,y);
  pdf.setFont('helvetica','normal');
  pdf.text(paymentCheckboxLine(),62,y);
  pdf.setFont('helvetica','bold');pdf.text('Data do Pagamento:',left,y+10);
  pdf.setFont('helvetica','normal');pdf.text(paymentDate,61,y+10);

  if(caregiver.pix_key){
    pdf.setFont('helvetica','bold');pdf.text('Chave PIX:',112,y+10);
    pdf.setFont('helvetica','normal');pdf.text(String(caregiver.pix_key),137,y+10);
  }

  y+=25;
  pdf.setFont('helvetica','bold');pdf.text('Assinatura do Prestador:',left,y);
  pdf.line(left,y+17,110,y+17);
  pdf.setFont('helvetica','normal');pdf.text(caregiver.name,64,y+23,{align:'center'});
  pdf.text(`CPF: ${cpf}`,64,y+29,{align:'center'});

  pdf.setFont('helvetica','bold');pdf.text('Assinatura e Carimbo da Empresa:',left,y+44);
  pdf.line(left,y+61,110,y+61);

  return pdf;
}
window.generateReceipt=(caregiverId,month)=>{
  try{
    const pdf=receiptDocument(caregiverId,month);
    const caregiver=caregivers.find(x=>x.id===caregiverId);
    pdf.save(`Recibo_${caregiver.name.replace(/[^\wÀ-ÿ]+/g,'_')}_${month}.pdf`);
  }catch(error){alert(error.message)}
};
function renderReceipts(){
  const month=$('#receiptMonth').value||monthNow();
  const rows=calculateClosing(month);
  $('#receiptsBody').innerHTML=rows.length?rows.map(x=>{
    const c=caregivers.find(a=>a.id===x.caregiverId);
    const doc=c?.has_mei&&c?.cnpj?c.cnpj:(c?.cpf||'');
    const type=c?.has_mei&&c?.cnpj?'MEI':'Sem MEI';
    return`<tr><td>${caregiverName(x.caregiverId)}<br><small class="muted">${type}</small></td><td>${doc}</td><td>${x.h12}</td><td>${x.h24}</td><td><strong>${money(x.total)}</strong></td><td><button class="btn small" onclick="generateReceipt('${x.caregiverId}','${month}')">Baixar PDF</button></td></tr>`;
  }).join(''):'<tr><td colspan="6" class="empty">Nenhum recibo disponível no período.</td></tr>';
}
$('#receiptMonth').value=monthNow();
$('#receiptPaymentDate').value=todayISO();
$('#receiptMonth').onchange=renderReceipts;
$('#generateAllReceiptsBtn').onclick=()=>{
  const month=$('#receiptMonth').value||monthNow();
  const rows=calculateClosing(month);
  if(!rows.length)return alert('Não há recibos para gerar neste período.');
  try{
    let pdf=null;
    rows.forEach((row,index)=>{pdf=receiptDocument(row.caregiverId,month,pdf,index>0)});
    pdf.save(`Recibos_Cuidare_${month}.pdf`);
  }catch(error){alert(error.message)}
};

$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginMsg').textContent='Entrando...';const{error}=await db.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});$('#loginMsg').textContent=error?error.message:''};
$('#logoutBtn').onclick=()=>db.auth.signOut();
async function applySession(s){user=s?.user||null;if(user){$('#authScreen').classList.add('hidden');$('#appRoot').classList.remove('hidden');await loadAll()}else{$('#appRoot').classList.add('hidden');$('#authScreen').classList.remove('hidden')}}
db.auth.onAuthStateChange((_,s)=>applySession(s));db.auth.getSession().then(({data})=>applySession(data.session));