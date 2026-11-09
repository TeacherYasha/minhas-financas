# Minhas Finanças — GitHub Pages + Google Sheets

Painel financeiro residencial, com todos os lançamentos feitos no site. A planilha serve apenas como armazenamento.

## Configuração necessária

### 1. Privacidade da planilha

- Planilha: `https://docs.google.com/spreadsheets/d/1iQuqP2wnrknq9w9idwErlYLJ_7uC0Y0D2lqFtzuHOEg`
- Proprietário: `guitaneto2@gmail.com`.
- Outros usuários permitidos: `yashasantos10@gmail.com` e `yashamsantos@gmail.com`.
- Manter o compartilhamento exclusivamente com esses três e-mails.
- Não usar a opção "Qualquer pessoa com o link".

### 2. Repositório GitHub

Na conta `TeacherYasha`, criar um repositório público chamado `minhas-financas`, sem substituir o site da Teacher Yasha.

Enviar `index.html`, `style.css`, `app.js`, `config.js` e `README.md` para a raiz do repositório. Em **Settings → Pages**, selecionar **Deploy from a branch → main → /(root)**. A URL prevista é `https://teacheryasha.github.io/minhas-financas/`.

### 3. Google Cloud OAuth

Na conta `guitaneto2@gmail.com`:

1. Abrir [Google Cloud Console](https://console.cloud.google.com/), criar ou selecionar um projeto para o site financeiro.
2. Ativar a **Google Sheets API** na biblioteca de APIs.
3. Em **Google Auth Platform**, configurar o consentimento OAuth. Usar o público externo e adicionar `guitaneto2@gmail.com`, `yashasantos10@gmail.com` e `yashamsantos@gmail.com` como usuários de teste enquanto o app estiver em teste.
4. Criar um **OAuth Client ID** para o tipo **Web application**.
5. Adicionar `https://teacheryasha.github.io` aos **Authorized JavaScript origins** (somente a origem, sem `/minhas-financas/`).
6. Copiar o Client ID que termina em `.apps.googleusercontent.com` e substituir `GOOGLE_CLIENT_ID` em `config.js`.
7. Publicar o `config.js` atualizado no GitHub e testar o login e uma gravação com as três contas.

O Google pode mostrar uma tela de consentimento solicitando acesso à planilha. A permissão `spreadsheets` permite acessar planilhas autorizadas por aquela conta, portanto revise o escopo antes de autorizar. Enquanto a tela de consentimento estiver em modo de teste, as autorizações podem expirar periodicamente e o Google pode impor limites de usuários de teste.

## Modelo de dados

O site utiliza a aba `Lancamentos` e as colunas A:S. As colunas A:N preservam o modelo original: ID, descrição, tipo, categoria, valor em reais, data do registro, vencimento, situação, número da parcela, total de parcelas, grupo, recorrente, registrado por, criado em.

As colunas O:S acrescentam **Quem pagou**, **Forma de pagamento**, **Tipo de gasto** (Casa/Pessoal), **Pessoa** (Crispim/Yasha, para despesas pessoais) e **Quantidade** opcional. A interface tem uma seção própria para gastos pessoais; os dados continuam na mesma tabela.

Formas de pagamento: Pix, Dinheiro, Débito, Crédito, Transferência, Boleto e Não informado. Nos registros históricos importados da planilha de setembro, a forma é marcada como Não informado, porque o arquivo original não contém essa informação.

O cadastro de uma compra parcelada cria um registro por mês e divide os centavos sem perda de arredondamento. Contas recorrentes são registradas para os próximos 24 meses.

### Listas de compras

A seção **Lista de compras** utiliza a aba privada `ListasCompras`, com uma linha por lista. O site mantém nesta aba título, data prevista, situação, itens em JSON, ID do lançamento correspondente, quem criou, quem pagou, forma de pagamento e data da compra. Não é necessário editar a planilha manualmente.

O usuário pode criar uma lista semanal, adicionar até 100 produtos, definir quantidade e preço unitário, marcar quais foram realmente comprados, salvar a lista e reutilizá-la em outra semana pelo botão **Duplicar**. A estimativa considera todos os produtos com preço; o total efetivo considera apenas os itens marcados. **Uma lista finalizada cria uma única despesa paga na categoria Mercado**, contendo a soma dos itens comprados. O detalhamento de produtos continua armazenado na própria lista. Listas finalizadas ficam bloqueadas para edição, mas podem ser duplicadas.

**Importante:** para registrar uma compra é necessário clicar em **Finalizar e lançar despesa**; apenas salvar a lista não altera o saldo financeiro. A finalização usa uma requisição ao Google Sheets com a inclusão da despesa e a conclusão da lista na mesma operação, além de verificar previamente o ID da compra para reduzir o risco de duplicidade. Evite finalizar simultaneamente a mesma lista em dois dispositivos.

## Áreas do site

- **Visão geral:** saldo, entradas, saídas, gráfico de categorias e prévia de até seis lançamentos.
- **Lançamentos:** extrato completo do mês, pesquisa, filtros de receitas/despesas e edição dos registros.
- **Lista de compras:** carrinho semanal com produtos, quantidades, preços, seleção dos itens comprados, total automático e lançamento agrupado de uma única despesa.
- **Parcelamentos:** compras agrupadas, total, saldo pendente, barra de progresso, próximos vencimentos e controle individual de cada parcela.
- **Contas fixas:** lista de vencimentos recorrentes e contas já classificadas como aluguel, energia, água, internet ou contas do mês, com totais e confirmação de pagamento por conta. Exibir uma conta nessa área não a transforma automaticamente em recorrente.
- **Gastos pessoais:** despesas individuais de Crispim e Yasha, com filtros e totais separados.

Os controles das páginas continuam usando a mesma Planilha Google privada. A aba extra `ListasCompras` armazena exclusivamente as listas e seus itens; a aba `Lancamentos` permanece como fonte das despesas e receitas, sem repetir cada produto como uma despesa individual.

## Segurança

- O GitHub Pages é público, mas **não carrega dados financeiros antes do login**.
- O e-mail no `config.js` apenas mostra uma mensagem amigável; a proteção efetiva dos dados vem do login Google e da lista de permissões da planilha. Nunca altere a planilha para acesso público.
- Não adicione senha, token OAuth, chave de serviço ou planilha com lançamentos reais ao repositório.
- O token de acesso permanece apenas na memória, sem armazenamento permanente no navegador. Para facilitar o retorno após atualizar a página, o site lembra somente o último e-mail autorizado (armazenado localmente) e oferece um botão de acesso rápido com `login_hint` e `prompt: ''`. O Google ainda exige um clique para emitir um novo token; há a opção **Usar outra conta Google**. Ao sair do site, o e-mail lembrado é removido.
- Os registros são enviados diretamente para a Google Sheets API. Não há Apps Script público com acesso irrestrito à planilha.
- Antes de adotar como controle principal da casa, teste com valores fictícios, confira a atualização no celular e computador, e configure backups periódicos da planilha no Drive.

## Estado atual

O site está publicado no GitHub Pages e o login com Google foi testado pelo proprietário. Os três e-mails da família estão autorizados na planilha e no site; os outros acessos permanecem bloqueados. Os dados anteriores e os registros históricos devem ser mantidos sem duplicação.
