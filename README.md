# Minhas Finanças — GitHub Pages + Google Sheets

Painel financeiro residencial, com todos os lançamentos feitos no site. A planilha serve apenas como armazenamento.

## Configuração necessária

### 1. Privacidade da planilha

- Planilha: `https://docs.google.com/spreadsheets/d/1iQuqP2wnrknq9w9idwErlYLJ_7uC0Y0D2lqFtzuHOEg`
- Proprietário: `guitaneto2@gmail.com`.
- Outro usuário permitido: `yashasantos10@gmail.com`.
- **Remover o compartilhamento antigo de `yashamsantos@gmail.com`.** No Google Planilhas, clique em Compartilhar → selecione a conta antiga → Remover acesso.
- Não usar a opção "Qualquer pessoa com o link".

### 2. Repositório GitHub

Na conta `TeacherYasha`, criar um repositório público chamado `minhas-financas`, sem substituir o site da Teacher Yasha.

Enviar `index.html`, `style.css`, `app.js`, `config.js` e `README.md` para a raiz do repositório. Em **Settings → Pages**, selecionar **Deploy from a branch → main → /(root)**. A URL prevista é `https://teacheryasha.github.io/minhas-financas/`.

### 3. Google Cloud OAuth

Na conta `guitaneto2@gmail.com`:

1. Abrir [Google Cloud Console](https://console.cloud.google.com/), criar ou selecionar um projeto para o site financeiro.
2. Ativar a **Google Sheets API** na biblioteca de APIs.
3. Em **Google Auth Platform**, configurar o consentimento OAuth. Usar o público externo e adicionar `guitaneto2@gmail.com` e `yashasantos10@gmail.com` como usuários de teste enquanto o app estiver em teste.
4. Criar um **OAuth Client ID** para o tipo **Web application**.
5. Adicionar `https://teacheryasha.github.io` aos **Authorized JavaScript origins** (somente a origem, sem `/minhas-financas/`).
6. Copiar o Client ID que termina em `.apps.googleusercontent.com` e substituir `GOOGLE_CLIENT_ID` em `config.js`.
7. Publicar o `config.js` atualizado no GitHub e testar o login e uma gravação com as duas contas.

O Google pode mostrar uma tela de consentimento solicitando acesso à planilha. A permissão `spreadsheets` permite acessar planilhas autorizadas por aquela conta, portanto revise o escopo antes de autorizar. Enquanto a tela de consentimento estiver em modo de teste, as autorizações podem expirar periodicamente e o Google pode impor limites de usuários de teste.

## Modelo de dados

O site utiliza a aba `Lancamentos` e as colunas A:N: ID, descrição, tipo, categoria, valor em reais, data do registro, vencimento, situação, número da parcela, total de parcelas, grupo, recorrente, registrado por, criado em.

O cadastro de uma compra parcelada cria um registro por mês e divide os centavos sem perda de arredondamento. Contas recorrentes são registradas para os próximos 24 meses.

## Segurança

- O GitHub Pages é público, mas **não carrega dados financeiros antes do login**.
- O e-mail no `config.js` apenas mostra uma mensagem amigável; a proteção efetiva dos dados vem do login Google e da lista de permissões da planilha. Nunca altere a planilha para acesso público.
- Não adicione senha, token OAuth, chave de serviço ou planilha com lançamentos reais ao repositório.
- O token de acesso permanece em memória nesta versão. O usuário precisará entrar novamente ao recarregar a página.
- Os registros são enviados diretamente para a Google Sheets API. Não há Apps Script público com acesso irrestrito à planilha.
- Antes de adotar como controle principal da casa, teste com valores fictícios, confira a atualização no celular e computador, e configure backups periódicos da planilha no Drive.

## Estado atual

O código está pronto para publicação, mas o login não funciona enquanto `GOOGLE_CLIENT_ID` estiver com o valor de configuração. O repositório GitHub precisa ser criado e o OAuth ativado. Não use dados financeiros reais antes desses testes.
