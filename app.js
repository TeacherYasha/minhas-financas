/* Minhas Finanças — GitHub Pages + Google OAuth + Google Sheets API.
   A autorização REAL depende das permissões da Planilha Google; a lista de
   e-mails do frontend serve para feedback e não substitui a ACL do Google. */
(() => {
  'use strict';
  const CONFIG = window.FINANCAS_CONFIG || {};
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
  const API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const SHOPPING_TAB = 'ListasCompras';
  const LAST_ACCOUNT_KEY = 'minhas-financas:ultimo-email-google';
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
  let token = '', tokenExpires = 0, profile = null, oauthClient = null, entries = [], shoppingLists = [], shoppingDraft = null, shoppingDirty = false, shoppingSaving = false, shoppingRevision = 0, shoppingSaveTimer = null, shoppingSheetTabId = null, page = 'overview', entryFilter = 'all', month = currentMonth(), entryKind = 'Saída', editingId = null, sheetTabId = null, isBusy = false, initialMonthResolved = false;

  function toast(message,isError=false) { const el=$('#toast');el.textContent=message;el.className=`toast visible${isError?' error':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),5200); }
  function setBusy(value) {isBusy=value;$('#saveEntry').disabled=value;$('#saveEntry').textContent=value?'Salvando...':editingId?'Salvar alterações':'Salvar lançamento';}
  function rememberedEmail() {
    try {
      const email=String(localStorage.getItem(LAST_ACCOUNT_KEY)||'').trim().toLowerCase();
      return (CONFIG.ALLOWED_EMAILS||[]).some(allowed=>String(allowed).trim().toLowerCase()===email)?email:'';
    } catch {return '';}
  }
  function saveRememberedEmail(email) {try {localStorage.setItem(LAST_ACCOUNT_KEY,email);}catch {}}
  function clearRememberedEmail() {try {localStorage.removeItem(LAST_ACCOUNT_KEY);}catch {}}
  function updateLoginOptions() {
    const email=rememberedEmail();
    $('#loginButtonText').textContent=email?`Continuar como ${email}`:'Entrar com minha conta Google';
    $('#switchAccountButton').classList.toggle('hidden',!email);
    $('#loginHint').textContent=email?'Acesso rápido com o Google. Não guardamos senhas ou tokens de acesso.':'Acesso exclusivo para as contas autorizadas da família.';
  }
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
  const shoppingRangeURL = (range) => `${API}/${encodeURIComponent(CONFIG.SPREADSHEET_ID)}/values/${encodeURIComponent(`${SHOPPING_TAB}!${range}`)}`;
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
    shoppingSheetTabId=data.sheets?.find(s=>s.properties?.title===SHOPPING_TAB)?.properties?.sheetId??null;
    sheetTabId=match.properties.sheetId;return sheetTabId;
  }
  function parseShoppingList(row,i){
    let items=[];try{const parsed=JSON.parse(row[4]||'[]');if(Array.isArray(parsed))items=parsed.map(item=>({id:String(item.id||makeId()),name:String(item.name||''),qty:Number(item.qty??1),unitCents:item.unitCents===null||item.unitCents===undefined?null:Number(item.unitCents),bought:Boolean(item.bought)})).slice(0,100);}catch{}
    return {row:i+2,id:String(row[0]||''),title:String(row[1]||''),date:String(row[2]||''),status:String(row[3]||'Planejada'),items,expenseId:String(row[5]||''),updated:String(row[6]||''),createdBy:String(row[7]||''),payer:String(row[8]||''),payment:String(row[9]||''),purchasedDate:String(row[10]||'')};
  }
  async function loadShoppingLists(){
    await loadSheetTabId();if(shoppingSheetTabId===null)throw Error('A aba ListasCompras não foi encontrada na Planilha Google.');
    const data=await googleRequest(`${shoppingRangeURL('A2:K')}?valueRenderOption=UNFORMATTED_VALUE`);
    shoppingLists=(data.values||[]).map(parseShoppingList).filter(list=>list.id).sort((a,b)=>b.updated.localeCompare(a.updated));
    if(shoppingDraft&&!shoppingDirty){const found=shoppingLists.find(item=>item.id===shoppingDraft.id);if(found)shoppingDraft={...found,items:found.items.map(item=>({...item}))};}
    if(page==='shopping')renderShopping();
  }
  function showLoggedOut() {token='';tokenExpires=0;profile=null;entries=[];shoppingLists=[];shoppingDraft=null;shoppingDirty=false;clearTimeout(shoppingSaveTimer);initialMonthResolved=false;$('#app').classList.add('hidden');$('#login').classList.remove('hidden');updateLoginOptions();}
  function showLoggedIn() {$('#login').classList.add('hidden');$('#app').classList.remove('hidden');const name=profile?.name||profile?.email?.split('@')[0]||'Família';$('#sideName').textContent=name.split(' ')[0];$('#sideAvatar').textContent=name.charAt(0).toUpperCase();$('#userAvatar').textContent=name.charAt(0).toUpperCase();}
  function isYashaAccount() {return ['yashasantos10@gmail.com','yashamsantos@gmail.com'].includes(String(profile?.email||'').trim().toLowerCase());}
  async function login(forceAccountSelection=false) {
    if(!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID.includes('CONFIGURAR_')) {toast('Falta configurar o Client ID Google. O site ainda está em preparação.',true);return;}
    try {
      if(!window.google?.accounts?.oauth2)throw Error('O serviço de login Google ainda não carregou. Aguarde e tente novamente.');
      if(!oauthClient) oauthClient=google.accounts.oauth2.initTokenClient({client_id:CONFIG.GOOGLE_CLIENT_ID,scope:SCOPES,include_granted_scopes:false,error_callback:error=>{
        if(error.type==='popup_failed_to_open')toast('O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.',true);
      },callback:async response=>{
        if(response.error){toast(`Login não autorizado: ${response.error}`,true);return;}
        token=response.access_token;tokenExpires=Date.now()+(Number(response.expires_in||3500)*1000);
        try {
          profile=await googleRequest('https://www.googleapis.com/oauth2/v3/userinfo');
          const email=String(profile?.email||'').trim().toLowerCase();
          const allowed=new Set((Array.isArray(CONFIG.ALLOWED_EMAILS)?CONFIG.ALLOWED_EMAILS:[]).map(value=>String(value).trim().toLowerCase()));
          if(!email)throw Error('O Google não informou o e-mail da conta. Tente entrar novamente e autorize o acesso ao perfil.');
          if(profile.email_verified!==true)throw Error(`O Google não confirmou o e-mail ${email}. Confira sua conta Google.`);
          if(!allowed.has(email))throw Error(`A conta selecionada foi ${email}, que não está na lista da família. Escolha um dos três e-mails autorizados.`);
          await loadSheetTabId();await loadRows();await loadShoppingLists().catch(error=>{console.warn('Registros de compras indisponíveis:',error.message);});saveRememberedEmail(email);showLoggedIn();toast(`Bem-vindo(a), ${profile.given_name||'família'}!`);
        }catch(error){showLoggedOut();toast(error.message||'Não foi possível entrar.',true);}
      }});
      const email=forceAccountSelection?'':rememberedEmail();
      oauthClient.requestAccessToken(email?{prompt:'',login_hint:email}:{prompt:'select_account'});
    }catch(error){toast(error.message,true);}
  }
  function logout() {if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});clearRememberedEmail();showLoggedOut();}
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
  const dateLabel=(iso)=>/^\d{4}-\d{2}-\d{2}$/.test(iso)?new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR'):iso||'—';
  function newInstallment(){openModal('Saída');$('#installments').value='2';updateFormHints();}
  function newRecurring(){openModal('Saída');$('#recurring').checked=true;updateFormHints();}
  function emptyFeature(container,title,detail,action,onClick){
    const box=createCell('div',null,'feature-empty');box.append(createCell('strong',title),createCell('p',detail));
    const button=createCell('button',action,'feature-action');button.type='button';button.addEventListener('click',onClick);box.append(button);container.append(box);
  }
  const cloneShopping = list => ({...list,items:list.items.map(item=>({...item}))});
  const blankShoppingItem = () => ({id:makeId(),name:'',qty:1,unitCents:null,bought:false});
  function shoppingTotals(list){
    const named=list.items.filter(item=>item.name.trim()),bought=named.filter(item=>item.bought);
    const sub=item=>Math.round(item.qty*item.unitCents);
    return {named,bought,estimated:named.reduce((sum,item)=>sum+(item.unitCents===null?0:sub(item)),0),actual:bought.reduce((sum,item)=>sum+(item.unitCents===null?0:sub(item)),0)};
  }
  function shoppingChanged(){
    shoppingDirty=true;shoppingRevision++;
    $('#shoppingSavedStatus').textContent='Alterações ainda não salvas';
    $('#shoppingSavedStatus').classList.add('unsaved');
    updateShoppingTotals();
  }
  function shoppingNewList(){
    if(shoppingDirty&&!confirm('Descartar as alterações não salvas da compra atual?'))return;
    shoppingDraft={row:null,id:makeId(),title:'Compra no mercado',date:nowISO(),status:'Planejada',items:[blankShoppingItem()],expenseId:'',updated:'',createdBy:profile?.email||'',payer:isYashaAccount()?'Yasha':'Crispim',payment:'',purchasedDate:nowISO()};
    shoppingDirty=true;shoppingRevision++;
    renderShopping();$('#shoppingTitle').focus();$('#shoppingTitle').select();
  }
  function shoppingSelect(id){
    if(shoppingDraft?.id===id)return;
    if(shoppingDirty&&!confirm('Descartar as alterações não salvas da compra atual?'))return;
    const found=shoppingLists.find(list=>list.id===id);if(!found)return;
    shoppingDraft=cloneShopping(found);shoppingDirty=false;renderShopping();
  }
  function shoppingDuplicate(){
    if(!shoppingDraft)return;
    if(shoppingDirty&&!confirm('Reutilizar os produtos? As alterações não salvas da compra atual serão descartadas.'))return;
    shoppingDraft={...cloneShopping(shoppingDraft),id:makeId(),row:null,title:`${shoppingDraft.title.replace(/\s*\(cópia\)$/i,'').slice(0,89)} (cópia)`,date:nowISO(),status:'Planejada',expenseId:'',createdBy:profile?.email||'',updated:'',payer:isYashaAccount()?'Yasha':'Crispim',payment:'',purchasedDate:nowISO(),items:shoppingDraft.items.filter(item=>item.name.trim()).map(item=>({...item,id:makeId(),bought:false}))};
    if(!shoppingDraft.items.length)shoppingDraft.items.push(blankShoppingItem());
    shoppingDirty=true;shoppingRevision++;renderShopping();toast('Novo registro criado com os produtos da compra anterior. Confira os valores e salve.');
  }
  function shoppingRow(list){return [list.id,list.title,list.date,list.status,JSON.stringify(list.items),list.expenseId||'',list.updated||new Date().toISOString(),list.createdBy||profile.email,list.payer||'',list.payment||'',list.purchasedDate||''];}
  function validateShopping(list){
    if(!list||!list.title.trim()||list.title.length>100||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(list.date))throw Error('Informe a identificação da compra e a data do cadastro.');
    if(list.items.length>100)throw Error('Cada compra permite até 100 produtos. Crie outro registro para os demais.');
    for(const item of list.items){
      if(!item.name.trim())continue;
      if(item.name.length>120||!Number.isFinite(item.qty)||item.qty<=0||item.qty>100000||item.unitCents!==null&&(!Number.isSafeInteger(item.unitCents)||item.unitCents<0||item.unitCents>1000000000))throw Error(`Confira a quantidade e o preço de "${item.name}".`);
    }
    if(JSON.stringify(list.items).length>45000)throw Error('Muitos produtos neste registro. Divida-os em duas compras.');
  }
  async function shoppingSave(silent=false){
    if(!shoppingDraft||shoppingSaving)return false;
    if(shoppingDraft.status==='Finalizada')throw Error('Uma compra registrada não pode ser alterada nesta tela. Reutilize os produtos em um novo registro.');
    const list=cloneShopping(shoppingDraft);list.title=$('#shoppingTitle').value.trim();list.date=$('#shoppingDate').value;
    list.payer=$('#shoppingPayer').value;list.payment=$('#shoppingPayment').value;list.purchasedDate=$('#shoppingPurchaseDate').value;
    list.items=list.items.filter(item=>item.name.trim());validateShopping(list);
    list.updated=new Date().toISOString();shoppingSaving=true;
    const revision=shoppingRevision;
    $('#shoppingSave').disabled=true;$('#shoppingSave').textContent='Salvando…';
    try{
      let row=list.row;
      if(!row){
        // Se a resposta de uma gravação anterior se perdeu, a ID permite recuperar sua linha.
        const existing=await googleRequest(`${shoppingRangeURL('A2:A')}?valueRenderOption=UNFORMATTED_VALUE`);
        const found=(existing.values||[]).findIndex(values=>String(values[0]||'')===list.id);
        if(found>=0)row=found+2;
      }
      if(row){
        const current=await googleRequest(`${shoppingRangeURL(`A${row}:K${row}`)}?valueRenderOption=UNFORMATTED_VALUE`);
        const currentData=current.values?.[0];
        if(!currentData||String(currentData[0])!==list.id)throw Error('Este registro mudou de posição na planilha. Atualize as compras antes de salvar.');
        if(String(currentData[3]||'')==='Finalizada'||String(currentData[5]||''))throw Error('Esta compra já foi registrada em outro dispositivo. Atualize as compras.');
        if(list.row&&String(currentData[6]||'')!==String(shoppingDraft.updated||''))throw Error('Esta compra foi alterada em outro dispositivo. Atualize os registros para não sobrescrever os dados da família.');
        await googleRequest(`${shoppingRangeURL(`A${row}:K${row}`)}?valueInputOption=RAW`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[shoppingRow(list)]})});
      }else{
        const response=await googleRequest(`${shoppingRangeURL('A:K')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[shoppingRow(list)]})});
        const match=String(response?.updates?.updatedRange||'').match(/![A-Z]+(\d+):/);if(!match)throw Error('O registro foi enviado, mas não foi possível confirmar a linha. Atualize antes de tentar novamente.');
        row=Number(match[1]);
      }
      list.row=row;
      const existingIndex=shoppingLists.findIndex(item=>item.id===list.id);
      if(existingIndex>=0)shoppingLists[existingIndex]=cloneShopping(list);else shoppingLists.unshift(cloneShopping(list));
      shoppingLists.sort((a,b)=>b.updated.localeCompare(a.updated));
      if(shoppingDraft?.id===list.id){
        shoppingDraft.row=row;shoppingDraft.updated=list.updated;
        if(shoppingRevision===revision){shoppingDraft=cloneShopping(list);shoppingDirty=false;}
      }
      renderShopping();if(!silent)toast('Produtos salvos na Planilha Google. Para contabilizar o gasto, registre a compra nas finanças.');return true;
    }catch(error){if(!silent)toast(error.message||'Não foi possível salvar os produtos.',true);throw error;}
    finally{shoppingSaving=false;$('#shoppingSave').disabled=false;$('#shoppingSave').textContent='Salvar produtos';}
  }
  function updateShoppingTotals(){
    if(!shoppingDraft)return;
    const {named,bought,estimated,actual}=shoppingTotals(shoppingDraft);
    $('#shoppingProgress').textContent=`${bought.length} de ${named.length} adquiridos`;
    $('#shoppingEstimated').textContent=money(estimated);
    $('#shoppingActual').textContent=money(actual);
    $('#shoppingFinish').disabled=shoppingSaving||shoppingDraft.status==='Finalizada'||!bought.length;
  }
  function shoppingRenderItems(){
    const list=shoppingDraft,locked=list.status==='Finalizada',container=$('#shoppingItems');container.replaceChildren();
    for(const item of list.items){
      const row=createCell('div',null,`shopping-item${item.bought?' checked':''}`);
      const boughtWrap=createCell('label',null,'shopping-check-cell');
      const bought=createCell('input');bought.type='checkbox';bought.checked=item.bought;bought.disabled=locked;bought.setAttribute('aria-label',`Comprado: ${item.name||'produto sem nome'}`);
      bought.addEventListener('change',()=>{item.bought=bought.checked;row.classList.toggle('checked',item.bought);shoppingChanged();});boughtWrap.append(bought);
      const name=createCell('input');name.type='text';name.placeholder='Ex.: Arroz 5 kg';name.maxLength=120;name.value=item.name;name.disabled=locked;name.setAttribute('aria-label','Nome do produto');name.addEventListener('input',()=>{item.name=name.value;shoppingChanged();});
      const qty=createCell('input');qty.type='number';qty.min='0.01';qty.max='100000';qty.step='0.01';qty.inputMode='decimal';qty.value=String(item.qty);qty.disabled=locked;qty.setAttribute('aria-label','Quantidade');
      const price=createCell('input');price.type='number';price.min='0';price.max='10000000';price.step='0.01';price.inputMode='decimal';price.placeholder='0,00';price.value=item.unitCents===null?'':(item.unitCents/100).toFixed(2);price.disabled=locked;price.setAttribute('aria-label','Preço unitário em reais');
      const sub=createCell('strong','—','shopping-item-subtotal');
      function recalc(){const cents=item.unitCents===null?null:Math.round(item.qty*item.unitCents);sub.textContent=cents===null||!Number.isFinite(cents)?'—':money(cents);shoppingChanged();}
      qty.addEventListener('input',()=>{item.qty=Number(qty.value);recalc();});
      price.addEventListener('input',()=>{item.unitCents=price.value.trim()===''?null:Math.round(Number(price.value)*100);recalc();});
      sub.textContent=item.unitCents===null?'—':money(Math.round(item.qty*item.unitCents));
      const remove=createCell('button','×','shopping-remove');remove.type='button';remove.title='Remover produto';remove.setAttribute('aria-label',`Remover ${item.name||'produto'}`);remove.disabled=locked;
      remove.addEventListener('click',()=>{list.items=list.items.filter(i=>i.id!==item.id);shoppingRenderItems();shoppingChanged();});
      row.append(boughtWrap,name,qty,price,sub,remove);container.append(row);
    }
    if(!list.items.length)container.append(createCell('p','Nenhum produto informado. Adicione um item desta compra.','shopping-no-items'));
    updateShoppingTotals();
  }
  function renderShopping(){
    $('#shoppingOpenCount').textContent=String(shoppingLists.filter(l=>l.status!=='Finalizada').length+(shoppingDraft&&!shoppingDraft.row&&shoppingDraft.status!=='Finalizada'?1:0));
    $('#shoppingPendingCount').textContent=String(shoppingLists.filter(l=>l.status!=='Finalizada').reduce((sum,l)=>sum+l.items.filter(i=>i.name.trim()&&!i.bought).length,0));
    $('#shoppingFinishedCount').textContent=String(shoppingLists.filter(l=>l.status==='Finalizada').length);
    $('#shoppingListCount').textContent=`${shoppingLists.length} ${shoppingLists.length===1?'compra':'compras'}`;
    const rail=$('#shoppingListCards');rail.replaceChildren();
    if(!shoppingLists.length)rail.append(createCell('p','Nenhuma compra cadastrada ainda.','shopping-rail-empty'));
    for(const list of shoppingLists){
      const {named,bought,estimated}=shoppingTotals(list),button=createCell('button',null,`shopping-list-card${shoppingDraft?.id===list.id?' selected':''}`);button.type='button';
      const title=createCell('strong',list.title),badge=createCell('span',list.status==='Finalizada'?'✓ Registrada':`${bought.length}/${named.length} adquiridos`,'shopping-list-badge');
      const meta=createCell('small',`${dateLabel(list.status==='Finalizada'?(list.purchasedDate||list.date):list.date)} · ${money(estimated)}`);
      button.append(title,badge,meta);button.addEventListener('click',()=>shoppingSelect(list.id));rail.append(button);
    }
    $('#shoppingEmpty').classList.toggle('hidden',Boolean(shoppingDraft));$('#shoppingWorkspace').classList.toggle('hidden',!shoppingDraft);
    if(!shoppingDraft)return;
    const list=shoppingDraft,locked=list.status==='Finalizada';
    $('#shoppingTitle').value=list.title;$('#shoppingDate').value=list.date;$('#shoppingPayer').value=list.payer||'';
    $('#shoppingPayment').value=list.payment||'';$('#shoppingPurchaseDate').value=list.purchasedDate||nowISO();
    for(const id of ['shoppingTitle','shoppingDate','shoppingPayer','shoppingPayment','shoppingPurchaseDate'])$(`#${id}`).disabled=locked;
    $('#shoppingAddItem').disabled=locked;$('#shoppingSave').disabled=locked||shoppingSaving;$('#shoppingFinish').disabled=locked||shoppingSaving;
    $('#shoppingDuplicate').disabled=false;
    $('#shoppingSavedStatus').textContent=locked?'✓ Compra lançada nas finanças':shoppingDirty?'Alterações ainda não salvas':'✓ Produtos salvos no Google';
    $('#shoppingSavedStatus').classList.toggle('unsaved',shoppingDirty&&!locked);
    $('#shoppingFinish').textContent=locked?'✓ Compra já registrada':'✓ Registrar compra nas finanças';
    shoppingRenderItems();
  }
  const shoppingCell=value=>({userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')}});
  async function shoppingFinish(){
    if(!shoppingDraft||shoppingSaving||shoppingDraft.status==='Finalizada')return;
    try{
      // Salvar confirma a linha real da lista antes de preparar a transação da compra.
      if(shoppingDirty||!shoppingDraft.row)await shoppingSave(true);
      const list=cloneShopping(shoppingDraft),{bought,actual}=shoppingTotals(list);
      if(!bought.length)throw Error('Marque pelo menos um produto adquirido nesta compra.');
      if(bought.some(item=>item.unitCents===null||!Number.isFinite(item.unitCents)||!Number.isFinite(item.qty)||item.qty<=0))throw Error('Preencha a quantidade e o preço de todos os produtos marcados.');
      if(!Number.isSafeInteger(actual)||actual<=0||actual>100000000000)throw Error('Confira os preços. O total precisa ser maior que zero.');
      if(!list.payer||!list.payment||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(list.purchasedDate))throw Error('Informe quem pagou, a forma de pagamento e a data da compra.');
      if(!confirm(`Registrar a compra "${list.title}" nas finanças?\n\n${bought.length} produtos adquiridos\nTotal pago: ${money(actual)}\n\nSerá criado UM lançamento de despesa. Depois, os produtos ficarão apenas para consulta.`))return;
      shoppingSaving=true;$('#shoppingFinish').disabled=true;$('#shoppingSave').disabled=true;
      await loadSheetTabId();
      // Revalidar os IDs diretamente na planilha impede repetição por atualização de página/reenvio.
      const [liveLists,liveExpenses]=await Promise.all([
        googleRequest(`${shoppingRangeURL(`A${list.row}:K${list.row}`)}?valueRenderOption=UNFORMATTED_VALUE`),
        googleRequest(`${rangeURL('A2:A')}?valueRenderOption=UNFORMATTED_VALUE`)
      ]);
      const live=liveLists.values?.[0];
      if(!live||String(live[0])!==list.id||String(live[3])==='Finalizada'||String(live[5]||''))throw Error('Esta lista já foi finalizada ou mudou no Google. Atualize as listas antes de continuar.');
      const expenseId=`compra-${list.id}`;
      if((liveExpenses.values||[]).some(values=>String(values[0])===expenseId))throw Error('Esta compra já tem um lançamento. Atualize a página para evitar duplicação.');
      const timestamp=new Date().toISOString(),record=[expenseId,`Compra — ${list.title}`,'Saída','Mercado',actual/100,nowISO(),list.purchasedDate,'Pago','','','','Não',profile.email,timestamp,list.payer,list.payment,'Casa','',`${bought.length} ${bought.length===1?'item':'itens'}`];
      const finished={...list,status:'Finalizada',expenseId,updated:timestamp};
      const requests=[
        {appendCells:{sheetId:sheetTabId,rows:[{values:record.map(shoppingCell)}],fields:'userEnteredValue'}},
        {updateCells:{range:{sheetId:shoppingSheetTabId,startRowIndex:list.row-1,endRowIndex:list.row,startColumnIndex:0,endColumnIndex:11},rows:[{values:shoppingRow(finished).map(shoppingCell)}],fields:'userEnteredValue'}}
      ];
      await googleRequest(`${API}/${encodeURIComponent(CONFIG.SPREADSHEET_ID)}:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests})});
      shoppingDraft=cloneShopping(finished);shoppingDirty=false;
      const idx=shoppingLists.findIndex(l=>l.id===list.id);if(idx>=0)shoppingLists[idx]=cloneShopping(finished);
      await loadRows();renderShopping();toast(`Compra registrada! ${money(actual)} lançado em uma única despesa.`);
    }catch(error){toast(error.message||'Não foi possível finalizar a compra.',true);}
    finally{shoppingSaving=false;if(shoppingDraft)renderShopping();}
  }
  function renderInstallments(){
    const all=entries.filter(e=>e.installments>1),groups=new Map();
    for(const entry of all){const key=entry.group||entry.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry);}
    $('#plansCount').textContent=String(groups.size);
    $('#plansRemaining').textContent=money(all.filter(e=>e.status==='Pendente').reduce((sum,e)=>sum+e.cents,0));
    $('#plansThisMonth').textContent=money(all.filter(e=>e.status==='Pendente'&&e.due.startsWith(month)).reduce((sum,e)=>sum+e.cents,0));
    const container=$('#installmentCards');container.replaceChildren();
    if(!groups.size){emptyFeature(container,'Nenhuma compra parcelada ainda','Cadastre sua primeira compra em parcelas para acompanhar cada vencimento.','＋ Cadastrar parcelamento',newInstallment);return;}
    const plans=[...groups.values()].map(rows=>{
      rows.sort((a,b)=>a.installment-b.installment||a.due.localeCompare(b.due));
      return {rows,next:rows.filter(e=>e.status==='Pendente').sort((a,b)=>a.due.localeCompare(b.due))[0]};
    }).sort((a,b)=>(a.next?.due||'9999').localeCompare(b.next?.due||'9999'));
    for(const {rows,next} of plans){
      const first=rows[0],done=rows.filter(e=>e.status!=='Pendente').length,total=rows.reduce((sum,e)=>sum+e.cents,0),remaining=rows.filter(e=>e.status==='Pendente').reduce((sum,e)=>sum+e.cents,0);
      const card=createCell('article',null,'plan-card'),header=createCell('div',null,'plan-header'),heading=createCell('div',null,'plan-heading');
      heading.append(createCell('span',first.category,'plan-category'),createCell('h3',first.description));
      header.append(heading,createCell('span',done===rows.length?'Concluído':`${done} de ${rows.length} concluídas`,'plan-badge'));card.append(header);
      const amounts=createCell('div',null,'plan-amounts');
      const totalBox=createCell('div');totalBox.append(createCell('small','TOTAL DA COMPRA'),createCell('strong',money(total)));
      const remainingBox=createCell('div');remainingBox.append(createCell('small','AINDA EM ABERTO'),createCell('strong',money(remaining)));
      amounts.append(totalBox,remainingBox);card.append(amounts);
      const track=createCell('div',null,'plan-track'),fill=createCell('span');fill.style.width=`${done/rows.length*100}%`;track.append(fill);card.append(track);
      card.append(createCell('p',next?`Próximo vencimento: ${dateLabel(next.due)} · ${money(next.cents)}`:'Todas as parcelas estão concluídas.','plan-next'));
      const details=createCell('details',null,'plan-details'),summary=createCell('summary',`Ver todas as parcelas (${rows.length})`);details.append(summary);
      const list=createCell('div',null,'plan-rows');
      for(const item of rows){
        const line=createCell('div',null,'plan-row'),info=createCell('div');
        info.append(createCell('strong',`Parcela ${item.installment || '—'} · ${money(item.cents)}`),createCell('small',dateLabel(item.due)));
        const badge=createCell('span',item.status,item.status==='Pendente'?'mini-state pending':'mini-state paid');
        const button=createCell('button',item.status==='Pendente'?'Confirmar':'Desfazer','mini-action');button.type='button';button.addEventListener('click',()=>setStatus(item.id));
        line.append(info,badge,button);list.append(line);
      }
      details.append(list);card.append(details);container.append(card);
    }
  }
  function renderRecurring(){
    const billCategories=new Set(['Contas','Aluguel','Energia','Água','Internet']);
    const bills=entries.filter(e=>e.type==='Saída'&&e.due.startsWith(month)&&(e.recurring||billCategories.has(e.category))).sort((a,b)=>a.due.localeCompare(b.due));
    const pending=bills.filter(e=>e.status==='Pendente');
    $('#billsCount').textContent=String(bills.length);
    $('#billsTotal').textContent=money(bills.reduce((sum,e)=>sum+e.cents,0));
    $('#billsPending').textContent=money(pending.reduce((sum,e)=>sum+e.cents,0));
    const container=$('#fixedBills');container.replaceChildren();
    if(!bills.length){emptyFeature(container,'Nenhuma conta fixa neste mês','Adicione aluguel, luz ou outra conta recorrente. Os vencimentos futuros serão organizados automaticamente.','＋ Adicionar conta fixa',newRecurring);return;}
    for(const bill of bills){
      const card=createCell('article',null,`bill-card ${bill.status==='Pendente'?'unpaid':'settled'}`),icon=createCell('div','▤','bill-icon'),info=createCell('div',null,'bill-info');
      info.append(createCell('small',`${bill.category} · ${bill.recurring?'Recorrente':'Registrada no mês'} · ${dateLabel(bill.due)}`),createCell('strong',bill.description),createCell('span',bill.status==='Pendente'?'Aguardando pagamento':'Pagamento confirmado'));
      const amount=createCell('strong',money(bill.cents),'bill-amount'),actions=createCell('div',null,'bill-actions');
      const status=createCell('button',bill.status==='Pendente'?'✓ Marcar como pago':'↶ Desfazer','bill-status');status.type='button';status.addEventListener('click',()=>setStatus(bill.id));
      const edit=createCell('button','Editar','bill-edit');edit.type='button';edit.addEventListener('click',()=>openModal(bill.type,bill.id));
      actions.append(status,edit);card.append(icon,info,amount,actions);container.append(card);
    }
  }
  function navigateTo(next){
    page=next;document.querySelectorAll('.nav-link').forEach(link=>link.classList.toggle('active',link.dataset.page===next));
    $('#sidebar').classList.remove('open');$('#mobileBackdrop').classList.add('hidden');
    render();
    if(next==='shopping'&&authValid())loadShoppingLists().catch(error=>toast(error.message,true));
  }
  function render(){
    $('#monthLabel').textContent=monthLabel(month);$('#summaryMonth').textContent=monthLabel(month);
    const current=entries.filter(e=>e.due.startsWith(month));const income=current.filter(e=>e.type==='Entrada').reduce((a,e)=>a+e.cents,0);const expense=current.filter(e=>e.type==='Saída').reduce((a,e)=>a+e.cents,0);
    const paid=entries.filter(e=>e.type==='Saída'&&e.status==='Pago').reduce((a,e)=>a+e.cents,0),received=entries.filter(e=>e.type==='Entrada'&&e.status==='Recebido').reduce((a,e)=>a+e.cents,0);
    const pending=current.filter(e=>e.type==='Saída'&&e.status==='Pendente').reduce((a,e)=>a+e.cents,0);
    $('#realBalance').textContent=money(received-paid);$('#incomeTotal').textContent=money(income);$('#expenseTotal').textContent=money(expense);$('#pendingTotal').textContent=money(pending);$('#forecast').textContent=money(income-expense);$('#forecast').className=income-expense<0?'negative':'positive';$('#incomeBar').style.width=`${income+expense?income/(income+expense)*100:50}%`;
    const groups=new Map();for(const e of current.filter(e=>e.type==='Saída'))groups.set(e.category,(groups.get(e.category)||0)+e.cents);const sorted=[...groups.entries()].sort((a,b)=>b[1]-a[1]);$('#categoryCount').textContent=`${groups.size} categorias`;$('#chartTotal').textContent=money(expense);
    if(expense){let start=0;const stops=[];for(let i=0;i<sorted.length;i++){const size=sorted[i][1]/expense*100;stops.push(`${COLORS[i%COLORS.length]} ${start.toFixed(4)}% ${(start+size).toFixed(4)}%`);start+=size;}$('#donut').style.background=`conic-gradient(${stops.join(',')})`;}else $('#donut').style.background='#2b4038';
    const legend=$('#categoryLegend');legend.replaceChildren();if(!sorted.length)legend.append(createCell('p','Adicione suas primeiras despesas para visualizar o gráfico.','empty-legend'));else sorted.slice(0,7).forEach(([cat,val],i)=>{const share=val/expense*100;const percentage=share<1?`${share.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:`${Math.round(share)}%`;const div=createCell('div',null,'legend-item'),dot=createCell('i'),label=createCell('span',cat),percent=createCell('b',percentage);dot.style.background=COLORS[i%COLORS.length];div.append(dot,label,percent);legend.append(div);});
    const titles={overview:'Últimos lançamentos',entries:'Extrato do mês',shopping:'Compras registradas',installments:'Parcelas do mês',recurring:'Contas fixas do mês',personal:'Gastos pessoais do mês'};
    const crumbs={overview:'Visão geral',entries:'Lançamentos',shopping:'Registrar compras',installments:'Parcelamentos',recurring:'Contas fixas',personal:'Gastos pessoais'};
    const subtitles={overview:'Uma prévia das movimentações mais recentes',entries:'Pesquise, filtre e gerencie todas as movimentações',shopping:'Produtos e valores de compras já realizadas',installments:'Controle de parcelas',recurring:'Vencimentos das contas fixas',personal:'Seus cuidados individuais'};
    const headings={overview:'Bem-vindo às suas finanças ✦',entries:'Tudo o que entra e sai ↗',shopping:'Sua compra detalhada 🛒',installments:'Compras sem surpresas ◷',recurring:'As contas da casa em dia ✓',personal:'Um espaço para cada um ♡'};
    const descriptions={overview:'Uma visão clara de tudo que acontece com o dinheiro da casa.',entries:'Seu histórico de receitas e despesas em um só lugar.',shopping:'Informe os produtos adquiridos e registre o total pago em uma única despesa.',installments:'Veja o progresso de cada compra e as próximas parcelas.',recurring:'Acompanhe o que vence e confirme os pagamentos do mês.',personal:'Autocuidado e despesas individuais, com tudo organizado por pessoa.'};
    $('#recordsTitle').textContent=titles[page];$('#crumb').textContent=crumbs[page];
    $('#recordsSubtitle').textContent=subtitles[page];
    $('#pageTitle').textContent=headings[page];
    $('#pageSubtitle').textContent=descriptions[page];
    document.querySelector('.headline .overline').textContent={overview:'SEU PAINEL FINANCEIRO',entries:'HISTÓRICO FINANCEIRO',shopping:'CADASTRO DE COMPRAS REALIZADAS',installments:'PLANEJAMENTO DE COMPRAS',recurring:'ORGANIZAÇÃO DA CASA',personal:'ESPAÇO INDIVIDUAL'}[page];
    $('#personalPanel').classList.toggle('hidden',page!=='personal');
    $('#shoppingPanel').classList.toggle('hidden',page!=='shopping');
    $('.period-bar').classList.toggle('hidden',page==='shopping');
    $('#newEntry').classList.toggle('hidden',page==='shopping');
    document.querySelector('.kpis').classList.toggle('hidden',page!=='overview');
    document.querySelector('.insights').classList.toggle('hidden',page!=='overview');
    $('.records').classList.toggle('hidden',page==='installments'||page==='recurring'||page==='shopping');
    $('#entriesPanel').classList.toggle('hidden',page!=='entries');
    $('#installmentsPanel').classList.toggle('hidden',page!=='installments');
    $('#recurringPanel').classList.toggle('hidden',page!=='recurring');
    $('#entriesIncome').textContent=money(income);$('#entriesExpense').textContent=money(expense);$('#entriesCount').textContent=String(current.length);
    document.querySelectorAll('#entryFilters [data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter===entryFilter));
    if(page==='installments')renderInstallments();
    if(page==='recurring')renderRecurring();
    if(page==='shopping')renderShopping();
    const personal=current.filter(e=>e.type==='Saída'&&e.scope==='Pessoal');
    $('#personalCrispimTotal').textContent=money(personal.filter(e=>e.person==='Crispim').reduce((sum,e)=>sum+e.cents,0));
    $('#personalYashaTotal').textContent=money(personal.filter(e=>e.person==='Yasha').reduce((sum,e)=>sum+e.cents,0));
    let displayed=current.filter(e=>page==='personal'?e.type==='Saída'&&e.scope==='Pessoal':page==='entries'&&entryFilter!=='all'?e.type===entryFilter:true);
    if(page==='personal'&&$('#personalPersonFilter').value!=='todos')displayed=displayed.filter(e=>e.person===$('#personalPersonFilter').value);
    displayed.sort((a,b)=>b.due.localeCompare(a.due)||b.created.localeCompare(a.created));
    const query=page==='overview'?'':$('#search').value.trim().toLocaleLowerCase('pt-BR');if(query)displayed=displayed.filter(e=>`${e.description} ${e.category} ${e.payer} ${e.payment} ${e.person}`.toLocaleLowerCase('pt-BR').includes(query));
    const totalDisplayed=displayed.length;
    if(page==='overview')displayed=displayed.slice(0,6);
    $('#recordCount').textContent=page==='overview'?`${displayed.length} de ${totalDisplayed} registros`:`${displayed.length} registros`;
    $('#search').classList.toggle('hidden',page==='overview');
    $('#viewAllEntries').classList.toggle('hidden',page!=='overview');
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
  function attach(){$('#loginButton').addEventListener('click',()=>login());$('#switchAccountButton').addEventListener('click',()=>login(true));$('#logout').addEventListener('click',logout);$('#newEntry').addEventListener('click',()=>openModal());$('#emptyAdd').addEventListener('click',()=>openModal());$('#newExpense').addEventListener('click',()=>openModal('Saída'));$('#newIncome').addEventListener('click',()=>openModal('Entrada'));
    $('#addInstallment').addEventListener('click',newInstallment);$('#addRecurring').addEventListener('click',newRecurring);
    $('#entryFilters').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;entryFilter=button.dataset.filter;render();});
    $('#viewAllEntries').addEventListener('click',()=>navigateTo('entries'));
    $('#prevMonth').addEventListener('click',()=>{month=monthShift(month,-1);render();});$('#nextMonth').addEventListener('click',()=>{month=monthShift(month,1);render();});$('#currentMonth').addEventListener('click',()=>{month=currentMonth();render();});$('#refresh').addEventListener('click',async()=>{try{await loadRows(true);if(page==='shopping')await loadShoppingLists();}catch(e){toast(e.message,true)}});
    $('#search').addEventListener('input',render);$('#nav').addEventListener('click',event=>{const b=event.target.closest('[data-page]');if(!b)return;navigateTo(b.dataset.page);});
    $('#menuToggle').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#mobileBackdrop').classList.remove('hidden');});$('#mobileBackdrop').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#mobileBackdrop').classList.add('hidden');});
    $('#closeModal').addEventListener('click',closeModal);$('#cancelModal').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',event=>{if(event.target===$('#modalBackdrop'))closeModal();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
    $('#entryForm').addEventListener('submit',saveForm);$('#typeExpense').addEventListener('click',()=>setKind('Saída'));$('#typeIncome').addEventListener('click',()=>setKind('Entrada'));$('#scope').addEventListener('change',updateScope);$('#installments').addEventListener('change',updateFormHints);$('#recurring').addEventListener('change',()=>{if($('#recurring').checked)$('#installments').value=1;updateFormHints();});
    $('#personalPersonFilter').addEventListener('change',render);
    $('#shoppingNew').addEventListener('click',shoppingNewList);$('#shoppingEmptyCreate').addEventListener('click',shoppingNewList);
    $('#shoppingDuplicate').addEventListener('click',shoppingDuplicate);
    $('#shoppingAddItem').addEventListener('click',()=>{if(!shoppingDraft||shoppingDraft.status==='Finalizada')return;if(shoppingDraft.items.length>=100){toast('Máximo de 100 itens por lista.',true);return;}shoppingDraft.items.push(blankShoppingItem());shoppingRenderItems();shoppingChanged();const inputs=$('#shoppingItems').querySelectorAll('input[aria-label="Nome do produto"]');inputs[inputs.length-1]?.focus();});
    for(const id of ['shoppingTitle','shoppingDate','shoppingPayer','shoppingPayment','shoppingPurchaseDate'])$(`#${id}`).addEventListener('change',()=>{if(shoppingDraft&&shoppingDraft.status!=='Finalizada'){shoppingDraft[id==='shoppingTitle'?'title':id==='shoppingDate'?'date':id==='shoppingPayer'?'payer':id==='shoppingPayment'?'payment':'purchasedDate']=$(`#${id}`).value;shoppingChanged();}});
    $('#shoppingTitle').addEventListener('input',()=>{if(shoppingDraft&&shoppingDraft.status!=='Finalizada'){shoppingDraft.title=$('#shoppingTitle').value;shoppingChanged();}});
    $('#shoppingSave').addEventListener('click',()=>shoppingSave().catch(()=>{}));
    $('#shoppingFinish').addEventListener('click',shoppingFinish);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authValid()&&profile){loadRows().catch(()=>{});if(page==='shopping'&&!shoppingDirty)loadShoppingLists().catch(()=>{});}});
  }
  $('#payer').add(new Option('Ambos','Ambos'));
  $('#payment').prepend(new Option('Selecione...',''));$('#payment').required=true;
  const viewAllButton=createCell('button','Ver todos →','view-all-button');viewAllButton.id='viewAllEntries';viewAllButton.type='button';$('.record-tools').append(viewAllButton);
  attach();updateLoginOptions();setKind('Saída');$('#dueDate').value=nowISO();render();
  if(!CONFIG.GOOGLE_CLIENT_ID||CONFIG.GOOGLE_CLIENT_ID.startsWith('CONFIGURAR_')){$('#loginHint').textContent='Aguardando configuração do login Google para ativar o site.';$('#loginButton').disabled=true;}
})();
