/* Minhas Finanças — GitHub Pages + Google OAuth + Google Sheets API.
   A autorização REAL depende das permissões da Planilha Google; a lista de
   e-mails do frontend serve para feedback e não substitui a ACL do Google. */
(() => {
  'use strict';
  const CONFIG = window.FINANCAS_CONFIG || {};
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
  const API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const $ = (s) => document.querySelector(s);
  const money = (cents) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
  const nowISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const currentMonth = () => nowISO().slice(0,7);
  const monthShift = (key,move) => { const [y,m]=key.split('-').map(Number),d=new Date(y,m-1+move,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const monthLabel = (key) => new Date(`${key}-15T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const makeId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const HOUSE_CATEGORIES = ['Alimentação','Mercado','Itens de Limpeza','Casa e Cozinha','Moto','Contas','Aluguel','Energia','Água','Internet','Gasolina','Compras online','Saúde','Lazer','Educação','Outros','Outros gastos'];
  const PERSONAL_CATEGORIES = ['Cabelo / Barbeiro','Unhas / Beleza','Cuidados pessoais','Saúde','Vestuário','Lazer','Outros pessoais'];
  const INCOME_CATEGORIES = ['Salário','Renda extra','Outras entradas'];
  const COLORS = ['#FFB453','#9D84FF','#FFE071','#4ED5F1','#4EE0AE','#FF8678','#D78BFF','#FF679A','#6AAEFF','#F0D173','#A7B8D8'];
  let token = '', tokenExpires = 0, profile = null, oauthClient = null, entries = [], page = 'overview', month = currentMonth(), entryKind = 'Saída', editingId = null, sheetTabId = null, isBusy = false, initialMonthResolved = false;

  function toast(message,isError=false) { const el=$('#toast');el.textContent=message;el.className=`toast visible${isError?' error':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),5200); }
  function setBusy(value) {isBusy=value;$('#saveEntry').disabled=value;$('#saveEntry').textContent=value?'Salvando...':editingId?'Salvar alterações':'Salvar lançamento';}
  function authValid() { return Boolean(token && Date.now() < tokenExpires - 60000); }
  async function googleRequest(url, options={}) {
    if (!authValid()) { showLoggedOut();throw Error('Sua sessão expirou. Entre novamente com o Google.'); }
    const result=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});
    if(!result.ok){let detail='';try { const body=await result.json();detail=body?.error?.message||''; }catch{}
      if(result.status===401) { showLoggedOut();throw Error('Sua sessão expirou. Faça login novamente.'); }
      if(result.status===403) throw Error('A conta não tem permissão para acessar esta planilha. Confira o compartilhamento e a autorização do Google.');
      throw Error(detail||`Erro no Google (${result.status}).`);
    }
    if(result.status===204)return null;
    return result.json();
  }
  const rangeURL = (range) => `${API}/${encodeURIComponent(CONFIG.SPREADSHEET_ID)}/values/${encodeURIComponent(`${CONFIG.SHEET_NAME}!${range}`)}`;
  async function loadRows(showNotice=false) {
    const result=await googleRequest(`${rangeURL('A2:S')}?valueRenderOption=UNFORMATTED_VALUE`);
    entries=(result.values||[]).map((a,i)=>({row:i+2,id:String(a[0]||''),description:String(a[1]||''),type:String(a[2]||'Saída'),category:String(a[3]||'Outros gastos'),cents:Math.round(Number(a[4]||0)*100),registered:String(a[5]||''),due:String(a[6]||''),status:String(a[7]||'Pendente'),installment:Number(a[8]||0),installments:Number(a[9]||0),group:String(a[10]||''),recurring:String(a[11]||'Não')==='Sim',by:String(a[12]||''),created:String(a[13]||''),payer:String(a[14]||'Não informado'),payment:String(a[15]||'Não informado'),scope:String(a[16]||'Casa'),person:String(a[17]||''),quantity:String(a[18]||'')})).filter(e=>e.id);
    if(!initialMonthResolved){initialMonthResolved=true;if(!entries.some(e=>e.due.startsWith(month))){const dates=entries.map(e=>e.due.slice(0,7)).filter(d=>/^\d{4}-\d{2}$/.test(d)).sort();if(dates.length)month=dates[dates.length-1];}}
    render(); if(showNotice)toast('Registros atualizados.');
  }
  async function loadSheetTabId() {
    if(sheetTabId!==null)return sheetTabId;
    const data=await googleRequest(`${API}/${encodeURIComponent(CONFIG.SPREADSHEET_ID)}?fields=sheets(properties(sheetId,title))`);
    const match=data.sheets?.find(s=>s.properties?.title===CONFIG.SHEET_NAME);
    if(!match)throw Error(`A aba ${CONFIG.SHEET_NAME} não foi encontrada na planilha.`);
    sheetTabId=match.properties.sheetId;return sheetTabId;
  }
  function showLoggedOut() {token='';tokenExpires=0;profile=null;entries=[];initialMonthResolved=false;$('#app').classList.add('hidden');$('#login').classList.remove('hidden');}
  function showLoggedIn() {$('#login').classList.add('hidden');$('#app').classList.remove('hidden');const name=profile?.name||profile?.email?.split('@')[0]||'Família';$('#sideName').textContent=name.split(' ')[0];$('#sideAvatar').textContent=name.charAt(0).toUpperCase();$('#userAvatar').textContent=name.charAt(0).toUpperCase();}
  function isYashaAccount() {return ['yashasantos10@gmail.com','yashamsantos@gmail.com'].includes(String(profile?.email||'').trim().toLowerCase());}
  async function login() {
    if(!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.includes('CONFIGURAR_')) {toast('Falta configurar o Client ID Google. O site ainda está em preparação.',true);return;}
    try {
      if(!window.google?.accounts?.oauth2)throw Error('O serviço de login Google ainda não carregou. Aguarde e tente novamente.');
      if(!oauthClient) oauthClient=google.accounts.oauth2.initTokenClient({client_id:CONFIG.GOOGLE_CLIENT_ID,scope:SCOPES,include_granted_scopes:false,callback:async response=>{
        if(response.error){toast(`Login não autorizado: ${response.error}`,true);return;}
        token=response.access_token;tokenExpires=Date.now()+(Number(response.expires_in||3500)*1000);
        try {
          profile=await googleRequest('https://www.googleapis.com/oauth2/v3/userinfo');
          const email=String(profile?.email||'').trim().toLowerCase();
          const allowed=new Set((Array.isArray(CONFIG.ALLOWED_EMAILS)?CONFIG.ALLOWED_EMAILS:[]).map(value=>String(value).trim().toLowerCase()));
          if(!email)throw Error('O Google não informou o e-mail da conta. Tente entrar novamente e autorize o acesso ao perfil.');
          if(profile.email_verified!==true)throw Error(`O Google não confirmou o e-mail ${email}. Confira sua conta Google.`);
          if(!allowed.has(email))throw Error(`A conta selecionada foi ${email}, que não está na lista da família. Escolha um dos três e-mails autorizados.`);
          await loadSheetTabId();await loadRows();showLoggedIn();toast(`Bem-vindo(a), ${profile.given_name||'família'}!`);
        }catch(error){showLoggedOut();toast(error.message||'Não foi possível entrar.',true);}
      }});
      oauthClient.requestAccessToken({prompt:'select_account'});
    }catch(error){toast(error.message,true);}
  }
  function logout() {if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});showLoggedOut();}
  function addMonths(iso,n) {const [y,m,d]=iso.split('-').map(Number);const idx=y*12+m-1+n;const yy=Math.floor(idx/12),mm=(idx%12)+1;const max=new Date(yy,mm,0).getDate();return `${yy}-${String(mm).padStart(2,'0')}-${String(Math.min(max,d)).padStart(2,'0')}`;}
  async function appendRows(records) {
    await googleRequest(`${rangeURL('A:S')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:records})});
  }
  function cellValuesFromForm() {
    const description=$('#description').value.trim(),value=Number($('#amount').value),cents=Math.round(value*100),due=$('#dueDate').value;
    const installments=Number($('#installments').value),recurring=$('#recurring').checked;
    if(!description || !Number.isFinite(cents) || cents<=0 || cents>100000000000 || !/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isInteger(installments)||installments<1||installments>60||(recurring&&installments>1))throw Error('Confira a descrição, o valor, a data e o número de parcelas.');
    const scope=entryKind==='Entrada'?'Casa':$('#scope').value,person=scope==='Pessoal'?$('#person').value:'';
    const payer=$('#payer').value,payment=$('#payment').value,quantity=$('#quantity').value.trim();
    if(!payer || !payment || (scope==='Pessoal'&&!person))throw Error('Informe quem pagou ou recebeu, a forma de pagamento e, para gastos pessoais, de quem é a despesa.');
    return {description,cents,due,installments,recurring,category:$('#category').value,settled:$('#settled').checked,payer,payment,scope,person,quantity};
  }
  function makeRow({id,description,cents,due,category,settled,installment,installments,group,recurring,registered,created,payer,payment,scope,person,quantity,by}) {
    return [id,description,entryKind,category,cents/100,registered,due,settled?(entryKind==='Entrada'?'Recebido':'Pago'):'Pendente',installment||'',installments||'',group||'',recurring?'Sim':'Não',by||profile.email,created,payer||'',payment||'Não informado',scope||'Casa',person||'',quantity||''];
  }
  async function saveForm(event) {
    event.preventDefault();if(isBusy)return;
    setBusy(true);
    try {
      const form=cellValuesFromForm();const registered=nowISO(),created=new Date().toISOString();
      if(editingId) {
        const record=entries.find(r=>r.id===editingId);if(!record)throw Error('Registro não encontrado. Atualize a página.');
        const row=makeRow({...form,id:record.id,installment:record.installment,installments:record.installments,group:record.group,recurring:record.recurring,registered:record.registered,created:record.created,by:record.by});
        await googleRequest(rangeURL(`A${record.row}:S${record.row}`)+'?valueInputOption=RAW',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
      } else {
        const count=form.recurring?24:form.installments,group=count>1?makeId():'',base=Math.floor(form.cents/form.installments),remainder=form.cents%form.installments;
        const rows=Array.from({length:count},(_,i)=>makeRow({...form,id:makeId(),cents:form.recurring?form.cents:base+(i<remainder?1:0),due:addMonths(form.due,i),settled:i===0&&count===1?form.settled:false,installment:form.installments>1?i+1:'',installments:form.installments>1?form.installments:'',group,registered,created}));
        await appendRows(rows);
      }
      month=form.due.slice(0,7);closeModal();await loadRows();toast('Lançamento salvo na sua Planilha Google.');
    }catch(error){toast(error.message||'Erro ao salvar.',true);}finally{setBusy(false);}
  }
  async function setStatus(id) {
    try{const r=entries.find(e=>e.id===id);if(!r)return;const next=r.status==='Pendente'?(r.type==='Entrada'?'Recebido':'Pago'):'Pendente';await googleRequest(rangeURL(`H${r.row}`)+'?valueInputOption=RAW',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[next]]})});await loadRows();toast('Situação atualizada.');}catch(error){toast(error.message,true);}
  }
  async function deleteRecord(id) {
    const r=entries.find(e=>e.id===id);if(!r||!confirm(`Excluir o registro "${r.description}" de ${monthLabel(r.due.slice(0,7))}?`))return;
    try{const sheetId=await loadSheetTabId();await googleRequest(`${API}/${encodeURIComponent(CONFIG.SPREADSHEET_ID)}:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:r.row-1,endIndex:r.row}}}]})});await loadRows();toast('Lançamento excluído.');}catch(error){toast(error.message,true);}
  }
  function openModal(kind='Saída',id=null){
    editingId=id;entryKind=kind;$('#entryForm').reset();$('#dueDate').value=nowISO();$('#installments').value=1;
    $('#scope').value=page==='personal'?'Pessoal':'Casa';
    $('#payer').value=isYashaAccount()?'Yasha':'Crispim';
    $('#payment').value='';
    $('#modalTitle').textContent=id?'Editar lançamento':'Novo lançamento';
    $('#recurring').disabled=Boolean(id);$('#installments').disabled=Boolean(id);$('#typeExpense').disabled=Boolean(id);$('#typeIncome').disabled=Boolean(id);
    let record=null;
    if(id){
      record=entries.find(e=>e.id===id);if(!record)return;entryKind=record.type;
      $('#description').value=record.description;$('#amount').value=(record.cents/100).toFixed(2);$('#dueDate').value=record.due;
      $('#recurring').checked=record.recurring;$('#installments').value=record.installments||1;$('#settled').checked=record.status!=='Pendente';
      $('#scope').value=record.scope;$('#person').value=record.person;$('#payer').value=['Crispim','Yasha','Ambos'].includes(record.payer)?record.payer:'';
      $('#payment').value=record.payment||'Não informado';$('#quantity').value=record.quantity;
    } else if(page==='personal'){$('#person').value=isYashaAccount()?'Yasha':'Crispim';}
    setKind(entryKind);
    if(record){if(![...$('#category').options].some(o=>o.value===record.category))$('#category').add(new Option(record.category,record.category));$('#category').value=record.category;}
    updateFormHints();$('#modalBackdrop').classList.remove('hidden');$('#description').focus();
  }
  function closeModal(){editingId=null;$('#modalBackdrop').classList.add('hidden');}
  function refreshCategories(){
    const selected=$('#category').value;
    const categories=entryKind==='Entrada'?INCOME_CATEGORIES:$('#scope').value==='Pessoal'?PERSONAL_CATEGORIES:HOUSE_CATEGORIES;
    $('#category').replaceChildren();
    categories.forEach(c=>$('#category').add(new Option(c,c)));
    $('#category').value=categories.includes(selected)?selected:entryKind==='Entrada'?'Salário':$('#scope').value==='Pessoal'?'Cuidados pessoais':'Alimentação';
  }
  function updateScope(){
    const isPersonal=entryKind==='Saída'&&$('#scope').value==='Pessoal';
    $('#personField').classList.toggle('hidden',!isPersonal);
    $('#person').required=isPersonal;
    refreshCategories();
  }
  function setKind(kind){
    entryKind=kind;$('#typeExpense').className=kind==='Saída'?'selected':'';$('#typeIncome').className=kind==='Entrada'?'income selected':'income';
    $('#scope').disabled=kind==='Entrada';if(kind==='Entrada')$('#scope').value='Casa';
    $('#payerLabel').firstChild.textContent=kind==='Entrada'?'Quem recebeu?':'Quem pagou?';
    $('#settledLabel').textContent=kind==='Entrada'?'Já foi recebido':'Já foi pago';updateScope();
  }
  function updateFormHints(){const multiple=Number($('#installments').value)>1,rec=$('#recurring').checked;$('#installments').disabled=rec||Boolean(editingId);$('#settled').disabled=(multiple||rec)&&!editingId;$('#formHelp').textContent=editingId?'A alteração será aplicada somente a este registro.':rec?'A conta será criada nos próximos 24 meses.':multiple?'O valor total será dividido automaticamente entre os meses.':'';}
  function createCell(tag,text,className){const el=document.createElement(tag);if(text!==undefined&&text!==null)el.textContent=String(text);if(className)el.className=className;return el;}
  function render(){
    $('#monthLabel').textContent=monthLabel(month);$('#summaryMonth').textContent=monthLabel(month);
    const current=entries.filter(e=>e.due.startsWith(month));const income=current.filter(e=>e.type==='Entrada').reduce((a,e)=>a+e.cents,0);const expense=current.filter(e=>e.type==='Saída').reduce((a,e)=>a+e.cents,0);
    const paid=entries.filter(e=>e.type==='Saída'&&e.status==='Pago').reduce((a,e)=>a+e.cents,0),received=entries.filter(e=>e.type==='Entrada'&&e.status==='Recebido').reduce((a,e)=>a+e.cents,0);
    const pending=current.filter(e=>e.type==='Saída'&&e.status==='Pendente').reduce((a,e)=>a+e.cents,0);
    $('#realBalance').textContent=money(received-paid);$('#incomeTotal').textContent=money(income);$('#expenseTotal').textContent=money(expense);$('#pendingTotal').textContent=money(pending);$('#forecast').textContent=money(income-expense);$('#forecast').className=income-expense<0?'negative':'positive';$('#incomeBar').style.width=`${income+expense?income/(income+expense)*100:50}%`;
    const groups=new Map();for(const e of current.filter(e=>e.type==='Saída'))groups.set(e.category,(groups.get(e.category)||0)+e.cents);const sorted=[...groups.entries()].sort((a,b)=>b[1]-a[1]);$('#categoryCount').textContent=`${groups.size} categorias`;$('#chartTotal').textContent=money(expense);
    if(expense){let start=0;const stops=[];for(let i=0;i<sorted.length;i++){const size=sorted[i][1]/expense*100;stops.push(`${COLORS[i%COLORS.length]} ${start.toFixed(4)}% ${(start+size).toFixed(4)}%`);start+=size;}$('#donut').style.background=`conic-gradient(${stops.join(',')})`;}else $('#donut').style.background='#2b4038';
    const legend=$('#categoryLegend');legend.replaceChildren();if(!sorted.length)legend.append(createCell('p','Adicione suas primeiras despesas para visualizar o gráfico.','empty-legend'));else sorted.slice(0,7).forEach(([cat,val],i)=>{const share=val/expense*100;const percentage=share<1?`${share.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:`${Math.round(share)}%`;const div=createCell('div',null,'legend-item'),dot=createCell('i'),label=createCell('span',cat),percent=createCell('b',percentage);dot.style.background=COLORS[i%COLORS.length];div.append(dot,label,percent);legend.append(div);});
    const titles={overview:'Lançamentos do mês',entries:'Todos os lançamentos',installments:'Parcelas do mês',recurring:'Contas fixas do mês',personal:'Gastos pessoais do mês'};
    const crumbs={overview:'Visão geral',entries:'Lançamentos',installments:'Parcelamentos',recurring:'Contas fixas',personal:'Gastos pessoais'};
    $('#recordsTitle').textContent=titles[page];$('#crumb').textContent=crumbs[page];
    $('#pageTitle').textContent=page==='overview'?'Bem-vindo às suas finanças ✦':page==='personal'?'Um espaço para cada um ♡':crumbs[page];
    $('#pageSubtitle').textContent=page==='personal'?'Autocuidado e despesas individuais, com tudo organizado por pessoa.':page==='overview'?'Uma visão clara de tudo que acontece com o dinheiro da casa.':'Acompanhe e organize os compromissos da sua residência.';
    $('#personalPanel').classList.toggle('hidden',page!=='personal');
    document.querySelector('.kpis').classList.toggle('hidden',page==='personal');
    document.querySelector('.insights').classList.toggle('hidden',page==='personal');
    const personal=current.filter(e=>e.type==='Saída'&&e.scope==='Pessoal');
    $('#personalCrispimTotal').textContent=money(personal.filter(e=>e.person==='Crispim').reduce((sum,e)=>sum+e.cents,0));
    $('#personalYashaTotal').textContent=money(personal.filter(e=>e.person==='Yasha').reduce((sum,e)=>sum+e.cents,0));
    let displayed=current.filter(e=>page==='installments'?e.installments>1:page==='recurring'?e.recurring:page==='personal'?e.type==='Saída'&&e.scope==='Pessoal':true);
    if(page==='personal'&&$('#personalPersonFilter').value!=='todos')displayed=displayed.filter(e=>e.person===$('#personalPersonFilter').value);
    displayed.sort((a,b)=>b.due.localeCompare(a.due)||b.created.localeCompare(a.created));
    const query=$('#search').value.trim().toLocaleLowerCase('pt-BR');if(query)displayed=displayed.filter(e=>`${e.description} ${e.category} ${e.payer} ${e.payment} ${e.person}`.toLocaleLowerCase('pt-BR').includes(query));
    $('#recordCount').textContent=`${displayed.length} registros`;
    const tbody=$('#recordBody');tbody.replaceChildren();$('#emptyRecords').classList.toggle('hidden',displayed.length>0);
    for(const e of displayed){
      const tr=createCell('tr'),nameTd=createCell('td'),box=createCell('div',null,'record-name'),symbol=createCell('b',e.scope==='Pessoal'?'♡':e.type==='Entrada'?'↙':'↗'),text=createCell('div'),strong=createCell('strong',e.description);
      const detailParts=[e.installments?`Parcela ${e.installment} de ${e.installments}`:e.recurring?'Conta mensal':e.scope==='Pessoal'?`Pessoal · ${e.person}`:e.type];
      if(e.quantity)detailParts.push(`Qtd.: ${e.quantity}`);
      const detail=createCell('small',detailParts.join(' · '));text.append(strong,detail);box.append(symbol,text);nameTd.append(box);
      const catTd=createCell('td'),tag=createCell('span',e.category,'category-tag');catTd.append(tag);
      const payerTd=createCell('td',e.payer,'table-secondary');
      const paymentTd=createCell('td',e.payment,'table-secondary');
      const dateTd=createCell('td',/\d{4}-\d{2}-\d{2}/.test(e.due)?new Date(`${e.due}T12:00:00`).toLocaleDateString('pt-BR'):e.due);
      const amountTd=createCell('td',`${e.type==='Entrada'?'+':'−'} ${money(e.cents)}`,e.type==='Entrada'?'amount-income':'amount-expense');
      const statusTd=createCell('td'),status=createCell('button',e.status,e.status==='Pendente'?'state pending':'state done');status.title='Clique para mudar a situação';status.addEventListener('click',()=>setStatus(e.id));statusTd.append(status);
      const actions=createCell('td'),edit=createCell('button','✎','icon-button'),remove=createCell('button','♲','icon-button');edit.title='Editar';remove.title='Excluir';edit.addEventListener('click',()=>openModal(e.type,e.id));remove.addEventListener('click',()=>deleteRecord(e.id));actions.append(edit,remove);
      tr.append(nameTd,catTd,payerTd,paymentTd,dateTd,amountTd,statusTd,actions);tbody.append(tr);
    }
  }
  function attach(){$('#loginButton').addEventListener('click',login);$('#logout').addEventListener('click',logout);$('#newEntry').addEventListener('click',()=>openModal());$('#emptyAdd').addEventListener('click',()=>openModal());$('#newExpense').addEventListener('click',()=>openModal('Saída'));$('#newIncome').addEventListener('click',()=>openModal('Entrada'));
    $('#prevMonth').addEventListener('click',()=>{month=monthShift(month,-1);render();});$('#nextMonth').addEventListener('click',()=>{month=monthShift(month,1);render();});$('#currentMonth').addEventListener('click',()=>{month=currentMonth();render();});$('#refresh').addEventListener('click',async()=>{try{await loadRows(true)}catch(e){toast(e.message,true)}});
    $('#search').addEventListener('input',render);$('#nav').addEventListener('click',event=>{const b=event.target.closest('[data-page]');if(!b)return;page=b.dataset.page;document.querySelectorAll('.nav-link').forEach(n=>n.classList.toggle('active',n===b));$('#sidebar').classList.remove('open');$('#mobileBackdrop').classList.add('hidden');render();});
    $('#menuToggle').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#mobileBackdrop').classList.remove('hidden');});$('#mobileBackdrop').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#mobileBackdrop').classList.add('hidden');});
    $('#closeModal').addEventListener('click',closeModal);$('#cancelModal').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',event=>{if(event.target===$('#modalBackdrop'))closeModal();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
    $('#entryForm').addEventListener('submit',saveForm);$('#typeExpense').addEventListener('click',()=>setKind('Saída'));$('#typeIncome').addEventListener('click',()=>setKind('Entrada'));$('#scope').addEventListener('change',updateScope);$('#installments').addEventListener('change',updateFormHints);$('#recurring').addEventListener('change',()=>{if($('#recurring').checked)$('#installments').value=1;updateFormHints();});
    $('#personalPersonFilter').addEventListener('change',render);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden && authValid() && profile)loadRows().catch(()=>{});});
  }
  $('#payer').add(new Option('Ambos','Ambos'));
  $('#payment').prepend(new Option('Selecione...',''));$('#payment').required=true;
  attach();setKind('Saída');$('#dueDate').value=nowISO();render();
  if(!CONFIG.GOOGLE_CLIENT_ID||CONFIG.GOOGLE_CLIENT_ID.startsWith('CONFIGURAR_')){$('#loginHint').textContent='Aguardando configuração do login Google para ativar o site.';$('#loginButton').disabled=true;}
})();
