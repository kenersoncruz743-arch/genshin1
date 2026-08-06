# Confronto Abissal — Draft de Genshin Impact

Site com duas telas:

- **`public/index.html`** — login/cadastro; cada um gerencia seus próprios personagens e constelações.
- **`public/draft.html`** — ferramenta de draft 1x1 com pontuação, timer e limite de armas 5★.

Todos os dados — catálogo de personagens/armas **e** login/personagens de cada usuário — ficam na mesma planilha do Google. Quem lê e escreve na planilha é o **servidor** (uma Netlify Function em Node.js, pasta `netlify/functions/`), nunca o navegador. É o mesmo padrão usado no projeto `gestaoavista`: a credencial da service account do Google fica só em variáveis de ambiente no painel da Netlify — nunca em um arquivo, nunca no `git`.

```
confronto-abissal/
├── public/                    # tudo que o navegador carrega (site estático)
│   ├── index.html
│   ├── draft.html
│   ├── css/style.css
│   └── js/
│       ├── config.js           # sem segredos — só configs de UI
│       ├── auth-client.js      # chama /api/auth e /api/personagens
│       ├── sheets.js           # busca o catálogo via /api/personagens?tipo=catalogo
│       ├── auth.js             # lógica da tela de login/perfil
│       └── draft.js            # lógica do draft
├── lib/
│   └── sheets.js               # ★ só roda no servidor — fala com a planilha usando a service account
├── api/
│   ├── auth.js                 # handler de signup/login
│   ├── personagens.js          # handler de catálogo + personagens do usuário
│   └── partida.js              # handler de criar/entrar/jogar/finalizar partida (draft sincronizado)
├── netlify/functions/api.js    # roteador das Netlify Functions
├── netlify.toml
├── package.json
└── .gitignore
```

---

## 1. Preparar a planilha e a service account do Google

Sua planilha: `https://docs.google.com/spreadsheets/d/1uEyZn8X_QZY8u6CkMFoFr7unbq-HxpX7s9qvHzRTHQw/edit`

1. Crie a aba **`Personagens`** com colunas: `Nome | Elemento | Raridade | Custo | ImagemURL`.
2. Crie a aba **`Armas`** com colunas: `Nome | Raridade | Custo | ImagemURL`.
3. **Não é mais necessário** deixar a planilha pública ("Qualquer pessoa com o link"). Em vez disso, compartilhe a planilha diretamente com o e-mail da sua service account (algo como `nome@seu-projeto.iam.gserviceaccount.com`, veja no campo `client_email` do JSON que você baixou do Google Cloud) com papel de **Editor**. Botão **Compartilhar** → cole esse e-mail → **Editor** → **Enviar**.
4. As abas `Usuarios`, `PersonagensUsuario` e `Partidas` **não precisam ser criadas à mão** — o servidor cria as três sozinho na primeira vez que forem usadas.

> ⚠️ Sobre a chave que você compartilhou nesta conversa: por segurança, considere-a exposta. Antes de configurar tudo, vá em [Google Cloud Console → IAM e administrador → Contas de serviço](https://console.cloud.google.com/iam-admin/serviceaccounts) → sua service account → aba **Chaves** → **exclua** a chave antiga → **Adicionar chave** → **Criar nova chave (JSON)**. Use somente essa chave nova nos passos abaixo.

---

## 1.1 Draft ao vivo entre dois dispositivos (como funciona)

Dois jogadores logados em aparelhos diferentes (computador, celular, o que for) jogam a **mesma partida** assim:

1. O **administrador** (quem tem `IsAdmin = TRUE` na aba `Usuarios`, veja 1.2) clica em **Criar Partida**, define as regras (pontos, nº de personagens/armas, limite de 5★, tempo por escolha) e recebe um **código de 6 caracteres**. Jogadores comuns não veem essa opção — só "Entrar com Código".
2. Ele compartilha esse código com o outro jogador (WhatsApp, por exemplo).
3. O outro jogador clica em **Entrar com Código**, digita o código, e a partida começa nos dois aparelhos ao mesmo tempo.
4. Cada escolha feita por um jogador é gravada na aba `Partidas` da planilha; o navegador do outro jogador **consulta a planilha a cada ~2,5 segundos** (polling) e atualiza a tela sozinho — sem precisar recarregar a página.
5. Só quem está com a vez consegue clicar nos itens; o cronômetro roda baseado no horário salvo no servidor, então funciona igual nos dois aparelhos mesmo que um esteja com internet mais lenta que o outro.

A aba `Partidas` guarda, entre outras colunas, um `EstadoJSON` (o "save" da partida) e um número de `Versao` que evita que uma jogada antiga sobrescreva uma mais nova por engano — se os dois tentarem jogar ao mesmo tempo, o segundo pedido é rejeitado e o navegador dele se atualiza sozinho com o estado mais recente.

## 1.2 Quem pode lançar a pontuação final

Ao final do draft (depois da fase de armas), aparece a tela de resumo com os dois times. **Só o administrador** vê ali um formulário pra digitar a pontuação final de cada jogador (e opcionalmente marcar o vencedor) — o botão **"Salvar Pontuação Final"** grava isso nas colunas `PontosFinaisJ1`, `PontosFinaisJ2` e `Vencedor` da aba `Partidas`.

Pra virar administrador:

1. Crie sua conta normalmente pelo site.
2. Abra a aba `Usuarios` na planilha, ache a sua linha (pelo `Email`) e escreva `TRUE` na coluna `IsAdmin`.
3. Pronto — da próxima vez que você fizer login, o painel de pontuação final aparece pra você.

> Isso é verificado no servidor toda vez que a pontuação é salva (não é só esconder o botão na tela) — mesmo que alguém tente chamar a API na mão, só passa quem tiver `IsAdmin = TRUE` na planilha.

**Limitação atual:** quem cria a partida (o admin) automaticamente vira o **Jogador 1** — ou seja, hoje o admin também precisa ser um dos dois duelistas. Um admin que só organiza partidas entre outras duas pessoas, sem jogar, é algo que dá pra evoluir depois se vocês quiserem (avise que eu ajusto).

## Abas da planilha (resumo)

| Aba | Colunas | Criada por |
|---|---|---|
| `Personagens` | `Nome, Elemento, Raridade, Custo, ImagemURL` | você |
| `Armas` | `Nome, Raridade, Custo, ImagemURL` | você |
| `Usuarios` | `Id, Email, SenhaHash, Username, IsAdmin, CriadoEm` | servidor (automático) |
| `PersonagensUsuario` | `UserId, Personagem, Constelacao, AtualizadoEm` | servidor (automático) |
| `Partidas` | `PartidaId, Jogador1Id, Jogador1Nome, Jogador2Id, Jogador2Nome, ConfigJSON, EstadoJSON, Status, Versao, PontosFinaisJ1, PontosFinaisJ2, Vencedor, CriadaEm, AtualizadaEm` | servidor (automático) |

---

## 2. Configurar o backend (variáveis de ambiente — nunca no código)

Do JSON da service account que você baixou, você vai usar três valores:

| Variável | De onde vem |
|---|---|
| `GOOGLE_SHEETS_CLIENT_EMAIL` | campo `client_email` do JSON |
| `GOOGLE_SHEETS_PRIVATE_KEY` | campo `private_key` do JSON (cole exatamente como está, com os `\n`) |
| `GOOGLE_SHEETS_ID` | `1uEyZn8X_QZY8u6CkMFoFr7unbq-HxpX7s9qvHzRTHQw` (o ID da sua planilha) |

**No painel da Netlify** (depois de importar o repositório, veja passo 4):

1. **Site settings → Environment variables → Add a variable**.
2. Adicione as três variáveis acima, uma por uma, com os valores do seu JSON.
3. Depois de salvar, vá em **Deploys → Trigger deploy → Deploy site** para o servidor pegar as novas variáveis.

**Nunca** cole essas variáveis em `lib/sheets.js`, em nenhum arquivo dentro de `public/`, nem em nenhum arquivo que vá pro `git` — o `lib/sheets.js` já está pronto para ler tudo via `process.env`.

Se quiser testar localmente antes do deploy, crie um arquivo `.env` na raiz (ele já está no `.gitignore`, então nunca sobe pro GitHub):

```
GOOGLE_SHEETS_CLIENT_EMAIL=seu-email@seu-projeto.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_ID=1uEyZn8X_QZY8u6CkMFoFr7unbq-HxpX7s9qvHzRTHQw
```

e rode com a [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install -g netlify-cli` → `netlify dev`.

---

## 3. Instalar dependências

```bash
cd confronto-abissal
npm install
```

Isso instala `google-spreadsheet`, `google-auth-library` e `bcryptjs` — usados só no servidor (`lib/sheets.js`), nunca enviados ao navegador.

---

## 4. Subir para o GitHub e implantar na Netlify

```bash
git init
git add .
git commit -m "Confronto Abissal - draft de Genshin Impact"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/confronto-abissal.git
git push -u origin main
```

Na Netlify:

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → escolha o repositório.
2. Build command: `echo 'No build needed'` (já vem do `netlify.toml`). Publish directory: `public`.
3. **Antes do primeiro deploy funcionar de verdade**, configure as variáveis de ambiente (passo 2) e dispare um novo deploy.

---

## 5. Testando

1. Abra o site → tela de **Perfil** → crie uma conta.
2. Confira na planilha se apareceram as abas `Usuarios` (com um hash bcrypt na coluna `SenhaHash`, nunca a senha em texto puro) e `PersonagensUsuario`.
3. Adicione personagens e defina a constelação de cada um.
4. Marque `TRUE` na coluna `IsAdmin` da sua linha em `Usuarios` (passo 1.2) pra virar admin.
5. Vá em **Draft** → **Criar Partida** → configure as regras → compartilhe o código com o outro jogador (em outro aparelho) → ele clica em **Entrar com Código**.

Se der erro de "Variáveis de ambiente não configuradas", revise o passo 2. Se der erro de permissão do Google, revise se a planilha foi compartilhada com o `client_email` da service account como Editor (passo 1.3).

### Erro no console: "Failed to load resource... 404" em style.css / config.js / sheets.js / draft.js

Isso significa que o navegador está pedindo os arquivos na raiz do site (`/style.css`, `/config.js`...) mas eles não estão lá — ou porque o **Publish directory** da Netlify não está configurado como `public`, ou porque o repositório no GitHub está com uma versão antiga/mesclada do projeto (de antes da pasta `public/` existir). Pra corrigir:

1. Confirme que o repositório no GitHub tem exatamente a estrutura deste zip (com a pasta `public/` contendo `index.html`, `draft.html`, `css/`, `js/`) — se tiver `index.html` direto na raiz do repo (sem `public/`), apague tudo e suba este zip de novo por cima.
2. Na Netlify: **Site settings → Build & deploy → Build settings → Publish directory** deve ser `public` (isso já vem certo no `netlify.toml`, mas confira se não foi sobrescrito manualmente no painel).
3. Depois de corrigir, **Deploys → Trigger deploy → Clear cache and deploy site** (não só "Deploy site" — o cache antigo pode servir os arquivos velhos).

## Personalizando pontuações e regras

- **Pontos de personagens/armas**: edite a coluna `Custo` na planilha.
- **Regras do draft**: configuráveis na própria tela de Draft, sem precisar de código.
