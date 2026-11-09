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

### Registro detalhado de compras realizadas

A seção **Registrar compras** foi pensada para informar os produtos e valores de uma compra que **já aconteceu**. Ela utiliza a aba privada `ListasCompras`, com uma linha por registro. O site mantém nessa aba a identificação, a data do cadastro, a situação, os produtos em JSON, o ID do lançamento correspondente, quem criou, quem pagou, a forma de pagamento e a data da compra realizada. Não é necessário editar a planilha manualmente.

O usuário pode cadastrar uma compra do mercado, informar até 100 produtos com as quantidades e os preços pagos e marcar os itens efetivamente adquiridos. O primeiro total soma todos os produtos com preço informado; o segundo soma somente os adquiridos. **Quando o usuário registra a compra nas finanças, é criada uma única despesa paga na categoria Mercado**, com a soma dos produtos marcados. O detalhamento fica armazenado no registro da compra, que depois estará disponível para consulta. O botão **Reutilizar produtos em nova compra** copia os produtos para facilitar o cadastro de compras semelhantes.

**Importante:** **Salvar produtos** guarda o registro em andamento, mas não altera o saldo financeiro. Para contabilizar a despesa da compra já realizada, clique em **Registrar compra nas finanças**. A gravação usa uma requisição ao Google Sheets com a inclusão da despesa e a conclusão do registro na mesma operação, além de verificar previamente o ID da compra para reduzir o risco de duplicidade. Evite registrar simultaneamente a mesma compra em dois dispositivos.

## Áreas do site

- **Visão geral:** saldo, entradas, saídas, gráfico de categorias e prévia de até seis lançamentos.
- **Lançamentos:** extrato completo do mês, pesquisa, filtros de receitas/despesas e edição dos registros.
- **Registrar compras:** cadastro de compras já realizadas, detalhamento de produtos, quantidades, preços pagos, seleção dos itens adquiridos, total automático e lançamento agrupado de uma única despesa.
- **Parcelamentos:** compras agrupadas, total, saldo pendente, barra de progresso, próximos vencimentos e controle individual de cada parcela.
- **Contas fixas:** lista de vencimentos recorrentes e contas já classificadas como aluguel, energia, água, internet ou contas do mês, com totais e confirmação de pagamento por conta. Exibir uma conta nessa área não a transforma automaticamente em recorrente.
- **Gastos pessoais:** despesas individuais de Crispim e Yasha, com filtros e totais separados.

Os controles das páginas continuam usando a mesma Planilha Google privada. A aba extra `ListasCompras` armazena exclusivamente o detalhamento dos produtos de cada compra; a aba `Lancamentos` permanece como fonte das despesas e receitas, sem repetir cada produto como uma despesa individual.

## Experiência visual

A navegação lateral possui um destaque deslizante e resposta visual ao toque. Ao trocar de área, uma cortina animada percorre o conteúdo, mostra o ícone e o nome da aba de destino e revela a nova tela com movimento. Os cartões entram em sequência, e a rolagem retorna suavemente ao início quando necessário. Os efeitos usam transições CSS para funcionar mesmo sem a API de animações do navegador. As transições respeitam a preferência de acessibilidade **Reduzir movimento** do dispositivo e foram ajustadas para continuar leves no celular.

## Segurança

- O GitHub Pages é público, mas **não carrega dados financeiros antes do login**.
- O e-mail no `config.js` apenas mostra uma mensagem amigável; a proteção efetiva dos dados vem do login Google e da lista de permissões da planilha. Nunca altere a planilha para acesso público.
- Não adicione senha, token OAuth, chave de serviço ou planilha com lançamentos reais ao repositório.
- O token de acesso permanece apenas na memória, sem armazenamento permanente no navegador. Para facilitar o retorno após atualizar a página, o site lembra somente o último e-mail autorizado (armazenado localmente) e oferece um botão de acesso rápido com `login_hint` e `prompt: ''`. O Google ainda exige um clique para emitir um novo token; há a opção **Usar outra conta Google**. Ao sair do site, o e-mail lembrado é removido.
- Os registros são enviados diretamente para a Google Sheets API. Não há Apps Script público com acesso irrestrito à planilha.
- Antes de adotar como controle principal da casa, teste com valores fictícios, confira a atualização no celular e computador, e configure backups periódicos da planilha no Drive.

## Estado atual

O site está publicado no GitHub Pages e o login com Google foi testado pelo proprietário. Os três e-mails da família estão autorizados na planilha e no site; os outros acessos permanecem bloqueados. Os dados anteriores e os registros históricos devem ser mantidos sem duplicação.
