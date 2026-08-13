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
│   ├── admin.html              # painel do admin: pontuação por constelação/refinamento
│   ├── css/style.css
│   └── js/
│       ├── config.js           # sem segredos — só configs de UI
│       ├── auth-client.js      # chama /api/auth e /api/personagens
│       ├── sheets.js           # busca o catálogo via /api/personagens?tipo=catalogo
│       ├── auth.js             # lógica da tela de login/perfil
│       ├── draft.js            # lógica do draft
│       └── admin.js            # lógica do painel do admin
├── lib/
│   ├── sheets.js               # ★ só roda no servidor — fala com a planilha usando a service account
│   ├── enka.js                 # ★ busca perfil público na Enka.Network a partir do UID
│   ├── enka-characters.json    # tabela de nomes de personagens (fallback offline)
│   └── enka-weapons.json       # tabela de nomes de armas (fallback offline)
├── api/
│   ├── auth.js                 # handler de signup/login
│   ├── personagens.js          # handler de catálogo + personagens do usuário
│   ├── partida.js              # handler de criar/entrar/jogar/finalizar partida (draft sincronizado)
│   ├── admin.js                # handler de alterar pontuação por nível + limite do deck (admin-only)
│   └── enka.js                 # handler de importar personagens pelo UID
├── netlify/functions/api.js    # roteador das Netlify Functions
├── netlify.toml
├── package.json
└── .gitignore
```

---

## 1. Preparar a planilha e a service account do Google

Sua planilha: `https://docs.google.com/spreadsheets/d/1uEyZn8X_QZY8u6CkMFoFr7unbq-HxpX7s9qvHzRTHQw/edit`

1. Crie a aba **`Personagens`** com colunas: `Nome | Elemento | Raridade | ImagemURL | CustoC0 | CustoC1 | CustoC2 | CustoC3 | CustoC4 | CustoC5 | CustoC6` (um custo pra cada constelação, de C0 a C6).
2. Crie a aba **`Armas`** com colunas: `Nome | Raridade | ImagemURL | CustoR1 | CustoR2 | CustoR3 | CustoR4 | CustoR5` (um custo pra cada refinamento, de R1 a R5).
3. Pode deixar as colunas `CustoC*`/`CustoR*` em branco no começo — o sistema usa um valor padrão por raridade até você ajustar. O jeito mais fácil de editar esses valores depois é pelo **painel do admin dentro do site** (seção 1.3), não precisa mexer direto na planilha.
4. **Não é mais necessário** deixar a planilha pública ("Qualquer pessoa com o link"). Em vez disso, compartilhe a planilha diretamente com o e-mail da sua service account (algo como `nome@seu-projeto.iam.gserviceaccount.com`, veja no campo `client_email` do JSON que você baixou do Google Cloud) com papel de **Editor**. Botão **Compartilhar** → cole esse e-mail → **Editor** → **Enviar**.
5. As abas `Usuarios`, `PersonagensUsuario` e `Partidas` **não precisam ser criadas à mão** — o servidor cria as três sozinho na primeira vez que forem usadas.

> ⚠️ Sobre a chave que você compartilhou nesta conversa: por segurança, considere-a exposta. Antes de configurar tudo, vá em [Google Cloud Console → IAM e administrador → Contas de serviço](https://console.cloud.google.com/iam-admin/serviceaccounts) → sua service account → aba **Chaves** → **exclua** a chave antiga → **Adicionar chave** → **Criar nova chave (JSON)**. Use somente essa chave nova nos passos abaixo.

---

## 1.1 Draft ao vivo entre dois dispositivos (como funciona)

Três pessoas participam de cada partida: o **administrador** (organiza, não joga) e **dois jogadores** (os que de fato fazem o draft), cada um no seu próprio aparelho:

1. O **administrador** (quem tem `IsAdmin = TRUE` na aba `Usuarios`, veja 1.2) clica em **Criar Partida**, define as regras (pontos, nº de personagens/armas, limite de 5★, tempo por escolha) e recebe um **código de 6 caracteres**. Jogadores comuns não veem essa opção — só "Entrar com Código".
2. Ele compartilha esse código com os dois jogadores (WhatsApp, por exemplo).
3. Cada jogador clica em **Entrar com Código** e digita o código. A primeira pessoa a entrar vira **Jogador 1**, a segunda vira **Jogador 2** — a partida só começa de verdade quando as duas vagas estiverem preenchidas.
4. O administrador acompanha tudo como **espectador**: ele também pode reabrir a tela com o mesmo código (o servidor reconhece que foi ele quem criou a partida e devolve a visão de espectador, sem ocupar nenhuma vaga) pra ver o draft acontecendo em tempo real, mas não consegue clicar em nenhum item.
5. Cada escolha feita por um jogador é gravada na aba `Partidas` da planilha; os navegadores dos outros dois (o outro jogador + o admin espectando) **consultam a planilha a cada ~2,5 segundos** (polling) e atualizam a tela sozinhos — sem precisar recarregar a página.
6. Só quem está com a vez consegue clicar nos itens; o cronômetro roda baseado no horário salvo no servidor, então funciona igual em todos os aparelhos mesmo que um esteja com internet mais lenta que o outro.

A aba `Partidas` guarda, entre outras colunas, um `EstadoJSON` (o "save" da partida) e um número de `Versao` que evita que uma jogada antiga sobrescreva uma mais nova por engano — se os dois jogadores tentarem jogar ao mesmo tempo, o segundo pedido é rejeitado e o navegador dele se atualiza sozinho com o estado mais recente.

## 1.2 Quem pode lançar a pontuação final

Ao final do draft (depois da fase de armas), aparece a tela de resumo com os dois times. **Só o administrador** vê ali um formulário pra digitar a pontuação final de cada jogador (e opcionalmente marcar o vencedor) — o botão **"Salvar Pontuação Final"** grava isso nas colunas `PontosFinaisJ1`, `PontosFinaisJ2` e `Vencedor` da aba `Partidas`.

Pra virar administrador:

1. Crie sua conta normalmente pelo site.
2. Abra a aba `Usuarios` na planilha, ache a sua linha (pelo `Email`) e escreva `TRUE` na coluna `IsAdmin`.
3. Pronto — da próxima vez que você fizer login, você vê a opção de **Criar Partida** e, ao final de cada draft, o painel de pontuação.

> Isso é verificado no servidor toda vez que a pontuação (e a criação da partida) é salva — não é só esconder o botão na tela. Mesmo que alguém tente chamar a API na mão, só passa quem tiver `IsAdmin = TRUE` na planilha.

## 1.3 Painel do Admin — pontuação por constelação/refinamento

Quem é admin (passo 1.2) vê um link **"Admin"** no menu, que abre `admin.html`. Lá dá pra definir, personagem por personagem e arma por arma, quanto custa cada nível:

- **Personagens**: um valor pra cada constelação, **C0 a C6** (ex: Hu Tao C0 = 50, Hu Tao C1 = 70…).
- **Armas**: um valor pra cada refinamento, **R1 a R5**.

Cada campo salva sozinho assim que você sai dele (não precisa de botão "salvar tudo"). Por baixo dos panos isso escreve nas colunas `CustoC0..CustoC6` (aba `Personagens`) e `CustoR1..CustoR5` (aba `Armas`) — ou seja, também dá pra editar em massa direto na planilha do Google se preferir, é a mesma informação.

**No draft**, ao clicar num personagem ou arma, o jogador escolhe o nível (C0–C6 ou R1–R5) num pop-up que mostra o custo de cada um; níveis que estourariam o orçamento restante ou o limite de armas 5★ aparecem desabilitados. O contador de "pontos restantes" de cada jogador (visível o tempo todo na tela do draft) reflete isso em tempo real.

## 1.4 UID do Genshin — importar personagens automaticamente (igual o Akasha)

No **Perfil**, cada jogador pode colar o próprio **UID do Genshin Impact** e clicar em **"Buscar Perfil"**. Isso busca o perfil público na [Enka.Network](https://enka.network) — a mesma fonte de dados que sites como o Akasha usam — sem precisar de login nem senha da conta HoYoverse, só o UID (que é público).

O que isso traz:
- **Nível e apelido** do jogador.
- **Andar/câmara do Abismo** (Espiral) mais recente que ele alcançou — ex: "12-3".
- Os **personagens da vitrine in-game** (até 8, os que o jogador escolheu mostrar), com **constelação** e **arma equipada** — esses personagens são adicionados automaticamente na lista "Meus Personagens" do jogador, respeitando o limite de pontos do deck (ver 1.5).

> **Importante:** pra vir a constelação e a arma certas, o jogador precisa ter **"Mostrar Detalhes do Personagem"** ativado na vitrine, dentro do próprio Genshin (Perfil → Vitrine de Personagens → engrenagem). Sem isso, a Enka só enxerga o nível — o personagem ainda é importado, mas a constelação entra como C0 por padrão.
>
> Personagens muito recentes podem não ser reconhecidos ainda (a tabela de nomes vem de um projeto de fãs, atualizada mas não instantânea) — nesse caso eles aparecem na lista de "ignorados" com o motivo.

As **imagens de personagens e armas** (na tela de Perfil, no Draft e no painel Admin) agora vêm direto da Enka.Network quando o nome bate com o catálogo dela — não depende mais de você preencher `ImagemURL` na planilha nem de nenhuma API de terceiros instável. Se um personagem não for reconhecido pela Enka, cai de volta pro que estiver na coluna `ImagemURL` da planilha.

## 1.5 Limite de pontos do deck do jogador

No painel **Admin**, em **"Limite de Pontos do Deck do Jogador"**, você define um teto de pontos pra lista "Meus Personagens" de cada jogador (some o custo de cada personagem na constelação escolhida, usando a mesma tabela `CustoC0..CustoC6`). Deixe o campo em branco pra não ter limite.

Isso vale tanto pra quem adiciona manualmente quanto pra importação por UID — se importar mais personagens do que cabe no limite, os que não couberem ficam de fora (aparecem como "ignorados" com o motivo "ultrapassaria o limite"). O jogador vê um contador "X / Y pontos" na tela de Perfil o tempo todo.

## 1.6 Tela de Perfil em cards + build ao clicar

A lista "Meus Personagens" e o catálogo completo pra adicionar personagens agora aparecem em formato de **cards** (imagem, raridade, nome), não mais numa lista ou dropdown:

- **Meus Personagens**: cada card tem a constelação (editável) e um botão **Remover**.
- **Adicionar Personagens**: logo abaixo, uma busca com cards de todo o catálogo — clique em **Adicionar**/**Remover** direto no card.
- **Clique na imagem ou no nome** de um personagem que já está no seu deck pra abrir um popup com a **build**: constelação, nível do personagem, arma equipada e refinamento — preenchido automaticamente quando vem da importação por UID (1.4). Personagens adicionados manualmente mostram só a constelação, já que não têm build associada.

## Abas da planilha (resumo)

| Aba | Colunas | Criada por |
|---|---|---|
| `Personagens` | `Nome, Elemento, Raridade, ImagemURL, CustoC0..CustoC6` | você (custos ajustáveis no painel Admin) |
| `Armas` | `Nome, Raridade, ImagemURL, CustoR1..CustoR5` | você (custos ajustáveis no painel Admin) |
| `Usuarios` | `Id, Email, SenhaHash, Username, IsAdmin, CriadoEm, UID, ApelidoJogo, NivelJogo, AbismoAndar, AbismoCamara, UIDAtualizadoEm` | servidor (automático) |
| `PersonagensUsuario` | `UserId, Personagem, Constelacao, NivelPersonagem, ArmaNome, ArmaRefinamento, ArmaNivel, AtualizadoEm` | servidor (automático) |
| `Partidas` | `PartidaId, CriadorId, CriadorNome, Jogador1Id, Jogador1Nome, Jogador2Id, Jogador2Nome, ConfigJSON, EstadoJSON, Status, Versao, PontosFinaisJ1, PontosFinaisJ2, Vencedor, CriadaEm, AtualizadaEm` | servidor (automático) |
| `Config` | `Chave, Valor` (guarda o limite de pontos do deck e futuras configurações) | servidor (automático) |

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
5. Vá em **Admin** → ajuste alguns custos por constelação/refinamento (passo 1.3) e opcionalmente um limite de pontos do deck (passo 1.5) → confira se salva na planilha.
6. De volta ao **Perfil**, cole um UID válido de Genshin (o seu ou de algum amigo que topar) → **Buscar Perfil** → confira se veio o Abismo e os personagens da vitrine.
7. Vá em **Draft** → **Criar Partida** → configure as regras → compartilhe o código com os dois jogadores (em dois outros aparelhos/contas) → cada um clica em **Entrar com Código**. Você (admin) fica acompanhando como espectador.

Se der erro de "Variáveis de ambiente não configuradas", revise o passo 2. Se der erro de permissão do Google, revise se a planilha foi compartilhada com o `client_email` da service account como Editor (passo 1, item 4).

### Erro no console: "Failed to load resource... 404" em style.css / config.js / sheets.js / draft.js

Isso significa que o navegador está pedindo os arquivos na raiz do site (`/style.css`, `/config.js`...) mas eles não estão lá — ou porque o **Publish directory** da Netlify não está configurado como `public`, ou porque o repositório no GitHub está com uma versão antiga/mesclada do projeto (de antes da pasta `public/` existir). Pra corrigir:

1. Confirme que o repositório no GitHub tem exatamente a estrutura deste zip (com a pasta `public/` contendo `index.html`, `draft.html`, `css/`, `js/`) — se tiver `index.html` direto na raiz do repo (sem `public/`), apague tudo e suba este zip de novo por cima.
2. Na Netlify: **Site settings → Build & deploy → Build settings → Publish directory** deve ser `public` (isso já vem certo no `netlify.toml`, mas confira se não foi sobrescrito manualmente no painel).
3. Depois de corrigir, **Deploys → Trigger deploy → Clear cache and deploy site** (não só "Deploy site" — o cache antigo pode servir os arquivos velhos).

## Personalizando pontuações e regras

- **Pontos de personagens/armas por nível**: painel **Admin** no site (mais fácil) ou direto nas colunas `CustoC0..CustoC6` / `CustoR1..CustoR5` da planilha (mesma informação).
- **Regras do draft** (orçamento, nº de slots, limite de 5★, tempo por escolha): configuráveis na própria tela de Draft ao criar a partida, sem precisar de código.
