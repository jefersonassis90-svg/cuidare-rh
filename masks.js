window.Masks=(()=>{
  const onlyNumbers=v=>String(v||'').replace(/\D/g,'');
  const formatCPF=v=>{v=onlyNumbers(v).slice(0,11);return v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')};
  const formatCNPJ=v=>{v=onlyNumbers(v).slice(0,14);return v.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2')};
  const formatPhone=v=>{v=onlyNumbers(v).slice(0,11);return v.length<=10?v.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d)/,'$1-$2'):v.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2')};
  const formatCEP=v=>onlyNumbers(v).slice(0,8).replace(/^(\d{5})(\d)/,'$1-$2');
  const formatMoney=v=>{const d=onlyNumbers(v);if(!d)return'';return(Number(d)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})};
  const formatMoneyFromNumber=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const moneyToNumber=v=>{const c=String(v||'').replace(/\s/g,'').replace('R$','').replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'');const n=Number(c);return Number.isFinite(n)?n:0};
  const bind=(id,fn)=>{const el=document.getElementById(id);if(!el||el.dataset.maskBound==='1')return;el.dataset.maskBound='1';el.addEventListener('input',()=>el.value=fn(el.value));el.value=fn(el.value)};
  const applyPixMask=(el,type)=>{if(!el)return;const p={cpf:'000.000.000-00',cnpj:'00.000.000/0000-00',phone:'(00) 00000-0000',email:'nome@exemplo.com',random:'Chave aleatória'};el.placeholder=p[type]||'Informe a chave PIX';el.oninput=()=>{if(type==='cpf')el.value=formatCPF(el.value);else if(type==='cnpj')el.value=formatCNPJ(el.value);else if(type==='phone')el.value=formatPhone(el.value)}};
  const refresh=()=>{bind('cgCpf',formatCPF);bind('cgCnpj',formatCNPJ);bind('cgPhone',formatPhone);bind('hsPhone',formatPhone);bind('hsCep',formatCEP);bind('asAmount',formatMoney);bind('spAmount',formatMoney);bind('prAmount',formatMoney);const t=document.getElementById('cgPixType'),i=document.getElementById('cgPix');if(t&&i)applyPixMask(i,t.value)};
  document.addEventListener('DOMContentLoaded',refresh);
  return{onlyNumbers,formatCPF,formatCNPJ,formatPhone,formatCEP,formatMoney,formatMoneyFromNumber,moneyToNumber,applyPixMask,refresh}
})();