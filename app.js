const cfg=window.APP_CONFIG||{};
const db=window.supabase.createClient(cfg.SUPABASE_URL||'',cfg.SUPABASE_PUBLISHABLE_KEY||'');
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
let user=null,caregivers=[],houses=[],assignments=[],shifts=[],advances=[],view='dashboard';

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
  const [cg,hs,as,sh,ad]=await Promise.all([
    db.from('caregivers').select('*').order('name'),
    db.from('houses').select('*').order('name'),
    db.from('caregiver_house_assignments').select('*').order('created_at'),
    db.from('shifts').select('*').order('shift_date',{ascending:false}),
    db.from('caregiver_advances').select('*').order('advance_date',{ascending:false})
  ]);
  for(const r of [cg,hs,as,sh,ad])if(r.error){sync('Erro');alert(r.error.message);return}
  caregivers=cg.data||[];houses=hs.data||[];assignments=as.data||[];shifts=sh.data||[];advances=ad.data||[];
  sync('Sincronizado');render();
}

function setView(v){
  view=v;$$('.view').forEach(x=>x.classList.remove('active'));$('#'+v+'View').classList.add('active');
  $$('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $('#pageTitle').textContent={dashboard:'Dashboard',calendar:'Calendário de escalas',caregivers:'Cuidadores',houses:'Casas e escalas',supports:'Suportes',advances:'Adiantamentos',receipts:'Recibos'}[v];
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
  renderCalendarFilters();renderCalendar();renderCaregivers();renderHouses();renderAssignments();renderSupports();renderAdvances();renderReceipts();
}


function renderCalendarFilters(){
  const selectedHouse=$('#calendarHouse')?.value||'';
  const selectedCaregiver=$('#calendarCaregiver')?.value||'';

  if($('#calendarHouse')){
    $('#calendarHouse').innerHTML='<option value="">Todas as casas</option>'+
      houses.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
    $('#calendarHouse').value=selectedHouse;
  }

  if($('#calendarCaregiver')){
    $('#calendarCaregiver').innerHTML='<option value="">Todos os cuidadores</option>'+
      caregivers.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
    $('#calendarCaregiver').value=selectedCaregiver;
  }
}
function calendarShiftMatches(shift){
  const houseId=$('#calendarHouse')?.value||'';
  const caregiverId=$('#calendarCaregiver')?.value||'';
  const type=$('#calendarType')?.value||'';

  if(houseId&&shift.house_id!==houseId)return false;
  if(caregiverId&&shift.planned_caregiver_id!==caregiverId&&shift.actual_caregiver_id!==caregiverId)return false;
  if(type==='support'&&shift.shift_type!=='support')return false;
  if(type==='24h'&&shift.turn!=='24h')return false;
  if(type==='12h'&&shift.turn==='24h')return false;
  return true;
}
function plannerEventHtml(shift){
  const isSupport=shift.shift_type==='support';
  const is24=shift.turn==='24h';
  const classes=['planner-event'];
  if(isSupport)classes.push('support');
  else if(is24)classes.push('hours24');

  const planned=caregiverName(shift.planned_caregiver_id);
  const actual=caregiverName(shift.actual_caregiver_id);
  const caregiverLine=isSupport?`Previsto: ${planned}`:actual;
  const label=isSupport?`Realizado: ${actual} · Suporte`:labelTurn(shift.turn);

  return `<button class="${classes.join(' ')}" onclick="openCalendarShift('${shift.id}')">
    <strong>${houseName(shift.house_id)}</strong>
    <small>${caregiverLine}</small>
    <small>${label}</small>
  </button>`;
}
function renderCalendar(){
  const grid=$('#plannerGrid');
  if(!grid)return;

  const month=$('#calendarMonth').value||monthNow();
  const [year,monthNumber]=month.split('-').map(Number);
  const firstDay=new Date(year,monthNumber-1,1,12);
  const lastDay=new Date(year,monthNumber,0,12);
  const mondayOffset=(firstDay.getDay()+6)%7;
  const startDate=new Date(firstDay);
  startDate.setDate(firstDay.getDate()-mondayOffset);
  const totalCells=Math.ceil((mondayOffset+lastDay.getDate())/7)*7;
  const today=todayISO();

  let html='';
  for(let i=0;i<totalCells;i++){
    const date=new Date(startDate);
    date.setDate(startDate.getDate()+i);
    const dateIso=iso(date);
    const inMonth=date.getMonth()===monthNumber-1;
    const weekend=[0,6].includes(date.getDay());
    const rawDayShifts=shifts
      .filter(x=>x.shift_date===dateIso&&calendarShiftMatches(x));

    const uniqueMap=new Map();
    for(const shift of rawDayShifts){
      const key=[
        shift.shift_date,
        shift.house_id,
        shift.planned_caregiver_id,
        shift.actual_caregiver_id,
        shift.turn,
        shift.shift_type
      ].join('|');

      const existing=uniqueMap.get(key);
      if(!existing||String(shift.updated_at||'')>String(existing.updated_at||'')){
        uniqueMap.set(key,shift);
      }
    }

    const dayShifts=[...uniqueMap.values()]
      .sort((a,b)=>{
        if(a.turn===b.turn)return houseName(a.house_id).localeCompare(houseName(b.house_id));
        return a.turn==='day'?-1:a.turn==='night'?0:1;
      });

    const classes=['planner-day'];
    if(!inMonth)classes.push('other-month');
    if(weekend)classes.push('weekend');
    if(dateIso===today)classes.push('today');

    html+=`<div class="${classes.join(' ')}">
      <div class="planner-day-number">
        <span>${date.getDate()}</span>
        <span class="planner-count">${dayShifts.length?`${dayShifts.length} plantão${dayShifts.length>1?'ões':''}`:''}</span>
      </div>
      <div class="planner-events">${dayShifts.map(plannerEventHtml).join('')}</div>
    </div>`;
  }

  grid.innerHTML=html||'<div class="planner-empty">Nenhum plantão encontrado para os filtros selecionados.</div>';
}
window.openCalendarShift=id=>{
  const shift=shifts.find(x=>x.id===id);
  if(!shift)return;

  const isSupport=shift.shift_type==='support';
  const fields=[
    ['Data',dateBR(shift.shift_date)],
    ['Casa',houseName(shift.house_id)],
    ['Turno',labelTurn(shift.turn)],
    ['Cuidador previsto',caregiverName(shift.planned_caregiver_id)],
    ['Cuidador realizado',caregiverName(shift.actual_caregiver_id)],
    ['Tipo',isSupport?'Substituição por suporte':'Plantão normal'],
    ['Valor',money(shift.amount)],
    ['Status',labelStatus(shift.status)],
    ['Observação',shift.notes||'Sem observações']
  ];

  $('#calendarDetailContent').innerHTML=fields.map(([label,value])=>
    `<div class="detail-item"><span>${label}</span><strong>${value}</strong></div>`
  ).join('');
  openModal('calendarDetailModal');
};
$('#calendarMonth').value=monthNow();
['calendarMonth','calendarHouse','calendarCaregiver','calendarType'].forEach(id=>{
  $('#'+id).onchange=renderCalendar;
});


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
  const selectedMonth=$('#assignmentMonth').value||monthNow();
  const generated=await generateAssignmentRange(r.data,selectedMonth);
  if(generated===false)return;
  closeModal('assignmentModal');
  loadAll();
};
$('#deleteAssignmentBtn').onclick=async()=>{
  const id=$('#assignmentId').value;
  if(!id)return;

  const assignment=assignments.find(x=>x.id===id);
  const message='Excluir esta escala fixa? Todos os plantões gerados por ela, inclusive substituições por suporte, serão removidos do calendário, dashboard e recibos.';
  if(!confirm(message))return;

  sync('Excluindo escala...');

  const shiftsResult=await db
    .from('shifts')
    .delete()
    .eq('assignment_id',id);

  if(shiftsResult.error){
    sync('Erro');
    return alert('Erro ao excluir os plantões da escala: '+shiftsResult.error.message);
  }

  const assignmentResult=await db
    .from('caregiver_house_assignments')
    .delete()
    .eq('id',id);

  if(assignmentResult.error){
    sync('Erro');
    return alert('Os plantões foram removidos, mas ocorreu erro ao excluir o vínculo: '+assignmentResult.error.message);
  }

  closeModal('assignmentModal');
  await loadAll();
  alert(`Escala excluída com sucesso${assignment?.caregiver_id?` para ${caregiverName(assignment.caregiver_id)}`:''}.`);
};
$('#generateAllBtn').onclick=async()=>{
  const m=$('#assignmentMonth').value||monthNow();
  const activeAssignments=assignments.filter(x=>x.status==='active');

  if(!activeAssignments.length){
    return alert('Não há escalas fixas ativas para gerar.');
  }

  const ok=confirm('Os plantões automáticos do mês selecionado serão substituídos pelas escalas atuais. Os suportes já registrados serão preservados. Deseja continuar?');
  if(!ok)return;

  let success=true;
  for(const a of activeAssignments){
    const generated=await generateAssignmentShifts(a,m);
    if(generated===false)success=false;
  }

  if(success){
    alert('Escalas do mês substituídas e geradas com sucesso.');
  }
  await loadAll();
};



function monthBounds(month){
  const [year,monthNumber]=month.split('-').map(Number);
  return{
    start:new Date(year,monthNumber-1,1,12,0,0,0),
    end:new Date(year,monthNumber,0,12,0,0,0)
  };
}
function iso(d){
  const year=d.getFullYear();
  const month=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
function calendarDayNumber(value){
  if(value instanceof Date){
    return Date.UTC(value.getFullYear(),value.getMonth(),value.getDate())/86400000;
  }
  const [year,month,day]=String(value).split('-').map(Number);
  return Date.UTC(year,month-1,day)/86400000;
}
function shouldGenerate(a,d){
  const currentDay=calendarDayNumber(d);
  const startDay=calendarDayNumber(a.start_date);
  const endDay=a.end_date?calendarDayNumber(a.end_date):null;

  if(currentDay<startDay||(endDay!==null&&currentDay>endDay))return false;
  if(a.schedule_type==='daily')return true;
  if(a.schedule_type==='weekdays')return (a.weekdays||[]).includes(d.getDay());
  if(a.schedule_type==='12x36'){
    const diff=currentDay-startDay;
    return diff>=0&&diff%2===0;
  }
  return false;
}
async function generateAssignmentShifts(a,month){
  const {start,end}=monthBounds(month);
  const monthStart=iso(start);
  const nextMonthDate=new Date(end);
  nextMonthDate.setDate(nextMonthDate.getDate()+1);
  const nextMonthStart=iso(nextMonthDate);

  // Localiza previamente os suportes já existentes para esta escala no mês.
  // Esses registros representam o mesmo plantão, mantendo:
  // - planned_caregiver_id = cuidador fixo previsto
  // - actual_caregiver_id = cuidador de suporte que realizou
  const supportResult=await db
    .from('shifts')
    .select('id,assignment_id,shift_date,turn,shift_type')
    .eq('assignment_id',a.id)
    .eq('shift_type','support')
    .gte('shift_date',monthStart)
    .lt('shift_date',nextMonthStart);

  if(supportResult.error){
    alert('Erro ao consultar os suportes existentes: '+supportResult.error.message);
    return false;
  }

  const protectedSupportKeys=new Set(
    (supportResult.data||[]).map(x=>`${x.shift_date}|${x.turn}`)
  );

  // Remove somente os plantões automáticos normais desta escala.
  // Os suportes permanecem intactos.
  const deleteResult=await db
    .from('shifts')
    .delete()
    .eq('assignment_id',a.id)
    .eq('shift_type','normal')
    .gte('shift_date',monthStart)
    .lt('shift_date',nextMonthStart);

  if(deleteResult.error){
    alert('Erro ao substituir a escala existente: '+deleteResult.error.message);
    return false;
  }

  const rows=[];
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    if(!shouldGenerate(a,d))continue;

    const shiftDate=iso(d);
    const uniqueKey=`${shiftDate}|${a.turn}`;

    // Se houve substituição por suporte, não recria um plantão normal concorrente.
    if(protectedSupportKeys.has(uniqueKey))continue;

    rows.push({
      assignment_id:a.id,
      shift_date:shiftDate,
      house_id:a.house_id,
      planned_caregiver_id:a.caregiver_id,
      actual_caregiver_id:a.caregiver_id,
      turn:a.turn,
      shift_type:'normal',
      amount:a.amount,
      status:'planned',
      created_by:user.id,
      updated_at:new Date().toISOString()
    });
  }

  if(!rows.length)return true;

  const insertResult=await db.from('shifts').insert(rows);

  if(insertResult.error){
    alert('Erro ao gerar escala: '+insertResult.error.message);
    return false;
  }

  return true;
}

async function generateAssignmentRange(assignment,endMonth){
  const firstMonth=assignment.start_date.slice(0,7);
  const [startYear,startMonth]=firstMonth.split('-').map(Number);
  const [endYear,endMonthNumber]=endMonth.split('-').map(Number);

  let cursor=new Date(startYear,startMonth-1,1,12,0,0,0);
  const endCursor=new Date(endYear,endMonthNumber-1,1,12,0,0,0);

  while(cursor<=endCursor){
    const monthValue=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;
    const generated=await generateAssignmentShifts(assignment,monthValue);
    if(generated===false)return false;
    cursor.setMonth(cursor.getMonth()+1);
  }

  return true;
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


const ADVANCE_MONTHLY_REFERENCE=200;
const paymentMethodLabel=v=>({pix:'PIX',transfer:'Transferência Bancária',cash:'Dinheiro'}[v]||v);
function caregiverAdvances(caregiverId,month,excludeId=null){
  return advances.filter(x=>x.caregiver_id===caregiverId&&x.competence===month&&x.id!==excludeId);
}
function totalAdvances(caregiverId,month,excludeId=null){
  return caregiverAdvances(caregiverId,month,excludeId).reduce((sum,x)=>sum+Number(x.amount||0),0);
}


function fillAdvanceCaregivers(){
  $('#adCaregiver').innerHTML=caregivers.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
}
function updateAdvanceLimitInfo(){
  const caregiverId=$('#adCaregiver').value;
  const month=$('#adCompetence').value;
  const id=$('#advanceId').value||null;
  const currentTotal=caregiverId&&month?totalAdvances(caregiverId,month,id):0;
  const newValue=moneyToNumber($('#adAmount').value);
  const projected=currentTotal+newValue;
  $('#adMonthTotal').value=money(currentTotal);

  const warning=$('#advanceLimitWarning');
  if(projected>ADVANCE_MONTHLY_REFERENCE){
    warning.classList.remove('hidden');
    warning.innerHTML=`⚠ O total após este lançamento será <strong>${money(projected)}</strong>, acima do limite mensal recomendado de <strong>${money(ADVANCE_MONTHLY_REFERENCE)}</strong>. O lançamento continuará permitido.`;
  }else{
    warning.classList.add('hidden');
    warning.textContent='';
  }
}
function renderAdvances(){
  const month=$('#advanceMonth').value||monthNow();
  const list=advances.filter(x=>x.competence===month);
  $('#advancesBody').innerHTML=list.length?list.map(x=>`<tr>
    <td>${dateBR(x.advance_date)}</td>
    <td>${caregiverName(x.caregiver_id)}</td>
    <td>${x.competence}</td>
    <td><strong>${money(x.amount)}</strong></td>
    <td>${paymentMethodLabel(x.payment_method)}</td>
    <td>${x.notes||''}</td>
    <td><button class="btn small" onclick="editAdvance('${x.id}')">Editar</button></td>
  </tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum adiantamento nesta competência.</td></tr>';
}
$('#advanceMonth').value=monthNow();
$('#advanceMonth').onchange=renderAdvances;
$('#newAdvanceBtn').onclick=()=>editAdvance();
window.editAdvance=id=>{
  fillAdvanceCaregivers();
  const x=advances.find(a=>a.id===id);
  $('#advanceId').value=x?.id||'';
  $('#adCaregiver').value=x?.caregiver_id||$('#adCaregiver').value;
  $('#adDate').value=x?.advance_date||todayISO();
  $('#adCompetence').value=x?.competence||($('#advanceMonth').value||monthNow());
  $('#adAmount').value=x?window.Masks.formatMoneyFromNumber(x.amount):'';
  $('#adPaymentMethod').value=x?.payment_method||'pix';
  $('#adNotes').value=x?.notes||'';
  $('#deleteAdvanceBtn').style.display=id?'inline-block':'none';
  window.Masks.refresh();
  updateAdvanceLimitInfo();
  openModal('advanceModal');
};
['adCaregiver','adCompetence','adAmount'].forEach(id=>$('#'+id).addEventListener('input',updateAdvanceLimitInfo));
$('#advanceForm').onsubmit=async e=>{
  e.preventDefault();
  const id=$('#advanceId').value;
  const p={
    caregiver_id:$('#adCaregiver').value,
    advance_date:$('#adDate').value,
    competence:$('#adCompetence').value,
    amount:moneyToNumber($('#adAmount').value),
    payment_method:$('#adPaymentMethod').value,
    notes:$('#adNotes').value.trim()||null,
    updated_at:new Date().toISOString()
  };
  if(p.amount<=0)return alert('Informe um valor de adiantamento maior que zero.');
  const projected=totalAdvances(p.caregiver_id,p.competence,id||null)+p.amount;
  if(projected>ADVANCE_MONTHLY_REFERENCE){
    const ok=confirm(`O total de adiantamentos ficará em ${money(projected)}, acima do limite recomendado de ${money(ADVANCE_MONTHLY_REFERENCE)}. Deseja salvar mesmo assim?`);
    if(!ok)return;
  }
  const r=id
    ?await db.from('caregiver_advances').update(p).eq('id',id)
    :await db.from('caregiver_advances').insert({...p,created_by:user.id});
  if(r.error)return alert(r.error.message);
  closeModal('advanceModal');
  loadAll();
};
$('#deleteAdvanceBtn').onclick=async()=>{
  const id=$('#advanceId').value;
  if(id&&confirm('Excluir este adiantamento?')){
    const r=await db.from('caregiver_advances').delete().eq('id',id);
    if(r.error)return alert(r.error.message);
    closeModal('advanceModal');
    loadAll();
  }
};


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
  return Object.values(map).map(row=>{
    row.advances=totalAdvances(row.caregiverId,month);
    row.net=Math.max(0,row.total-row.advances);
    return row;
  });
}

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
  pdf.setFontSize(10.5);
  pdf.text('Adiantamentos:',left,109);
  pdf.text(money(row.advances),50,109);
  pdf.text('Valor Líquido Recebido:',105,109);
  pdf.setFontSize(12);pdf.text(money(row.net),155,109);

  pdf.setFont('helvetica','normal');pdf.setFontSize(10.5);
  const declaration=`Declaro, para os devidos fins, que recebi da empresa Cuidare Boa Viagem o valor líquido acima descrito, após o desconto dos adiantamentos, referente a ${row.h12} plantão(ões) de 12 horas e ${row.h24} plantão(ões) de 24 horas, além dos deslocamentos, plantões alinhados e seus respectivos deslocamentos, serviços prestados conforme contrato de prestação de serviço firmado entre as partes.`;
  const declLines=pdf.splitTextToSize(declaration,width);
  pdf.text(declLines,left,122);

  let y=122+declLines.length*5+12;

  pdf.setFont('helvetica','bold');
  pdf.setFontSize(10.5);
  pdf.text(`Plantões de 12 horas: ${row.h12}`,left,y);
  pdf.text(`Plantões de 24 horas: ${row.h24}`,left,y+8);
  pdf.text(`Valor Bruto: ${money(row.total)}`,left,y+18);
  pdf.text(`Adiantamentos: ${money(row.advances)}`,left,y+26);
  pdf.text(`Valor Líquido: ${money(row.net)}`,left,y+34);

  y+=48;
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
    return`<tr>
      <td>${caregiverName(x.caregiverId)}<br><small class="muted">${type}</small></td>
      <td>${doc}</td>
      <td>${x.h12}</td>
      <td>${x.h24}</td>
      <td><strong>${money(x.total)}</strong></td>
      <td>${money(x.advances)}</td>
      <td><strong>${money(x.net)}</strong></td>
      <td><button class="btn small" onclick="generateReceipt('${x.caregiverId}','${month}')">Baixar PDF</button></td>
    </tr>`;
  }).join(''):'<tr><td colspan="8" class="empty">Nenhum recibo disponível no período.</td></tr>';
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