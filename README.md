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

**Valores em reais:** nos formulários de receitas, despesas e compras, os campos monetários aceitam valores como `100`, `100,50` e `R$ 1.234,56`. Ao sair do campo, a exibição é padronizada como `R$ 100,00` ou `R$ 1.234,56`. Os valores são convertidos em centavos no navegador e continuam gravados como números na planilha, sem alterar dados antigos.

O cadastro de uma compra parcelada cria um registro por mês e divide os centavos sem perda de arredondamento. Contas recorrentes são registradas para os próximos 24 meses.

### Registro detalhado de compras realizadas

A seção **Registrar compras** foi pensada para informar os produtos e valores de uma compra que **já aconteceu**. Ela utiliza a aba privada `ListasCompras`, com uma linha por registro. O site mantém nessa aba a identificação, a data do cadastro, a situação, os produtos em JSON, o ID do lançamento correspondente, quem criou, quem pagou, a forma de pagamento e a data da compra realizada. Não é necessário editar a planilha manualmente.

O usuário pode cadastrar uma compra do mercado, informar até 100 produtos com as quantidades e os preços pagos e marcar os itens efetivamente adquiridos. O primeiro total soma todos os produtos com preço informado; o segundo soma somente os adquiridos. **Quando o usuário registra a compra nas finanças, é criada uma única despesa paga na categoria Mercado**, com a soma dos produtos marcados. O detalhamento fica armazenado no registro da compra, que depois estará disponível para consulta. O botão **Reutilizar produtos em nova compra** copia os produtos para facilitar o cadastro de compras semelhantes.

**Importante:** **Salvar produtos** guarda o registro em andamento, mas não altera o saldo financeiro. Para contabilizar a despesa da compra já realizada, clique em **Registrar compra nas finanças**. A gravação usa uma requisição ao Google Sheets com a inclusão da despesa e a conclusão do registro na mesma operação, além de verificar previamente o ID da compra para reduzir o risco de duplicidade. Evite registrar simultaneamente a mesma compra em dois dispositivos.

## Áreas do site

O menu lateral usa apenas quatro grupos principais, com submenus expansíveis: **Geral**; **Entrada de dinheiro** → Salários e Renda extra; **Contas** → Contas fixas, Parcelamentos e Gastos pessoais; **Registro de compras** → Nova compra e Histórico de compras. Clicar no título de um grupo abre sua visão geral, enquanto os subitens vão diretamente à área ou ao filtro correspondente. O extrato completo continua acessível pelo botão *Ver todos* na visão geral. As animações e o estado ativo acompanham as trocas de seção, inclusive no celular.

- **Visão geral:** saldo inicial transportado dos meses anteriores, resultado do mês, saldo previsto para o próximo mês, saldo real efetivado, entradas, saídas, gráfico de categorias e prévia de até seis lançamentos.
- **Lançamentos:** extrato completo do mês, pesquisa, filtros de receitas/despesas e edição dos registros.
- **Salários e entradas:** área exclusiva para dinheiro já recebido, com **Todos os meses** (histórico integral das receitas) ou **Mês selecionado** (receitas daquele período). Quatro indicadores: total das receitas, salários, outras entradas e **saldo disponível** (receitas confirmadas menos despesas pagas até o mês selecionado). Não há mais o cartão redundante de "Já recebido" nem a previsão "Ainda a receber". Receitas novas são automaticamente marcadas como recebidas e não podem ser programadas como parcelas, recorrências ou lançadas com data futura. Exibe também o saldo transportado dos meses anteriores, totais por pessoa (Crispim, Yasha ou Ambos), filtros e botões de cadastro. Os registros continuam na mesma aba `Lancamentos`, sem cópias.
- **Registro de compras:** **Nova compra** abre somente o editor de produtos (sem a lista lateral), com quantidades, preços pagos e lançamento de uma despesa única. **Histórico de compras** prioriza a lista das compras anteriores e abre os detalhes quando um registro é selecionado. A visão geral reúne as duas áreas.
- **Parcelamentos:** compras agrupadas, total, saldo pendente, barra de progresso, próximos vencimentos e controle individual de cada parcela.
- **Contas fixas:** lista de vencimentos recorrentes e contas já classificadas como aluguel, energia, água, internet ou contas do mês, com totais e confirmação de pagamento por conta. Exibir uma conta nessa área não a transforma automaticamente em recorrente.
- **Gastos pessoais:** despesas individuais de Crispim e Yasha, com filtros e totais separados.

Os controles das páginas continuam usando a mesma Planilha Google privada. A aba extra `ListasCompras` armazena exclusivamente o detalhamento dos produtos de cada compra; a aba `Lancamentos` permanece como fonte das despesas e receitas, sem repetir cada produto como uma despesa individual.

### Saldo transportado entre meses

O saldo inicial de um mês corresponde às **entradas menos as saídas de todos os meses anteriores**. O resultado previsto do mês é a diferença entre as entradas e despesas cadastradas naquele mês. A soma dos dois valores é o saldo previsto que seguirá para o mês seguinte. Por exemplo, R$ 2.000,00 em entradas menos R$ 1.500,00 em despesas de agosto geram R$ 500,00 de saldo inicial em setembro.

Se o salário for recebido no final de outubro, o lançamento permanece em outubro, mas integra o **saldo inicial de novembro** e continua disponível no orçamento enquanto não for consumido por despesas. A área **Salários e entradas** mostra esse saldo mesmo quando não há nenhum novo salário cadastrado em novembro. Ao entrar no sistema, o calendário permanece no mês atual; não retorna automaticamente ao último mês que teve lançamentos.

O transporte é um **cálculo automático**, não uma nova receita: nenhum salário ou gasto é copiado para a planilha, impedindo dupla contagem. Os saldos inicial e final são previsões que incluem lançamentos pendentes. O cartão **Saldo real acumulado** mostra apenas recebimentos marcados como *Recebido* e despesas marcadas como *Pago* até o mês escolhido. Como a planilha registra vencimento, mas não uma data separada de liquidação, pagamentos e recebimentos feitos com atraso ainda pertencem ao mês indicado no campo de data/vencimento.

## Experiência visual

A navegação lateral possui um destaque deslizante e resposta visual ao toque. Ao trocar de área, uma cortina animada percorre o conteúdo, mostra o ícone e o nome da aba de destino e revela a nova tela com movimento. Os cartões entram em sequência, e a rolagem retorna suavemente ao início quando necessário. Os efeitos usam transições CSS para funcionar mesmo sem a API de animações do navegador. No topo do site, o botão **Animações ligadas / Ativar animações** informa o estado atual. Se o Windows ou navegador solicitar movimento reduzido, a família pode ativar os efeitos explicitamente para este site, sem alterar as configurações do sistema; a escolha fica salva apenas no navegador. Também é possível desligar as animações pelo botão.

## Segurança

- O GitHub Pages é público, mas **não carrega dados financeiros antes do login**.
- O e-mail no `config.js` apenas mostra uma mensagem amigável; a proteção efetiva dos dados vem do login Google e da lista de permissões da planilha. Nunca altere a planilha para acesso público.
- Não adicione senha, token OAuth, chave de serviço ou planilha com lançamentos reais ao repositório.
- O token de acesso permanece apenas na memória, sem armazenamento permanente no navegador. Para facilitar o retorno após atualizar a página, o site lembra somente o último e-mail autorizado (armazenado localmente) e oferece um botão de acesso rápido com `login_hint` e `prompt: ''`. O Google ainda exige um clique para emitir um novo token; há a opção **Usar outra conta Google**. Ao sair do site, o e-mail lembrado é removido.
- Os registros são enviados diretamente para a Google Sheets API. Não há Apps Script público com acesso irrestrito à planilha.
- Antes de adotar como controle principal da casa, teste com valores fictícios, confira a atualização no celular e computador, e configure backups periódicos da planilha no Drive.

## Estado atual

O site está publicado no GitHub Pages e o login com Google foi testado pelo proprietário. Os três e-mails da família estão autorizados na planilha e no site; os outros acessos permanecem bloqueados. Os dados anteriores e os registros históricos devem ser mantidos sem duplicação.
