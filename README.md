# Confronto Abissal — Draft de Genshin Impact

Site estático com duas telas:

- **`index.html`** — login/cadastro do usuário; cada um gerencia seus próprios personagens e constelações.
- **`draft.html`** — a ferramenta de draft 1x1 com pontuação, timer e limite de armas 5★. Os dados de personagens e armas (nome, elemento, raridade, custo, imagem) vêm direto da sua planilha do Google.

Nenhum backend próprio é necessário: os dados de jogo vêm do Google Sheets (leitura pública) e os dados de usuário (login, personagens, constelações) ficam no Supabase (gratuito).

---

## 1. Preparar a planilha do Google

Sua planilha: `https://docs.google.com/spreadsheets/d/1uEyZn8X_QZY8u6CkMFoFr7unbq-HxpX7s9qvHzRTHQw/edit`

1. Crie **duas abas** com exatamente esses nomes: `Personagens` e `Armas`.
2. Na aba **Personagens**, use estas colunas na primeira linha (cabeçalho):

   | Nome | Elemento | Raridade | Custo | ImagemURL |
   |---|---|---|---|---|
   | Hu Tao | Pyro | 5 | 88 | https://.../hutao.png |

3. Na aba **Armas**, use:

   | Nome | Raridade | Custo | ImagemURL |
   |---|---|---|---|
   | Homa | 5 | 85 | https://.../homa.png |

4. Em **ImagemURL**, cole o link direto do PNG (funciona com imagens hospedadas em qualquer lugar público — GitHub, Imgur, etc. Links do Google Drive só funcionam se convertidos para link direto de imagem).
5. Compartilhe a planilha: botão **Compartilhar** → **Qualquer pessoa com o link** → papel de **Leitor**. Isso é obrigatório — sem isso o site não consegue ler os dados.
6. Só quem tem acesso de **edição** na planilha pode alterar pontuação — é assim que o requisito "só o admin altera pontuação" é garantido: o admin edita a planilha, os jogadores só usam o draft.

Qualquer atualização feita na planilha aparece automaticamente no site (os dados são buscados toda vez que a página de draft é aberta).

---

## 2. Criar o banco de login (Supabase — gratuito)

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Clique em **New Project**. Anote a senha do banco (não precisa depois, mas guarde).
3. Quando o projeto terminar de criar, vá em **Project Settings → API**. Copie:
   - **Project URL**
   - **anon public key**
4. Abra o arquivo `js/config.js` deste projeto e cole os dois valores em `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
5. No painel do Supabase, vá em **SQL Editor → New query**, cole todo o conteúdo do arquivo `sql/schema.sql` deste projeto e clique em **Run**. Isso cria as tabelas `profiles` e `user_characters`, já com as regras de segurança (cada usuário só acessa os próprios dados).
6. (Opcional) Em **Authentication → Providers**, você pode desativar a confirmação por e-mail se quiser que o cadastro seja instantâneo (útil para testes).

---

## 3. Subir para o GitHub

```bash
cd confronto-abissal        # pasta deste projeto
git init
git add .
git commit -m "Confronto Abissal - draft de Genshin Impact"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/confronto-abissal.git
git push -u origin main
```

Se preferir sem terminal: crie um repositório novo em [github.com/new](https://github.com/new), depois use o botão **"uploading an existing file"** na página do repositório e arraste todos os arquivos desta pasta.

---

## 4. Deploy no Netlify

**Opção A — conectar direto ao GitHub (recomendado, atualiza sozinho a cada push):**

1. Acesse [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Escolha **GitHub** e selecione o repositório `confronto-abissal`.
3. Build command: deixe **em branco**. Publish directory: `.` (ponto — já está configurado no `netlify.toml`).
4. Clique em **Deploy**. Em 1–2 minutos o site estará no ar em um link tipo `https://confronto-abissal.netlify.app`.

**Opção B — arrastar e soltar (mais rápido, sem GitHub):**

1. Acesse [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arraste a pasta inteira do projeto (com `js/`, `css/`, `index.html`, `draft.html`).
3. Pronto, o link já é gerado.

> Lembrete: preencha `js/config.js` com as chaves do Supabase **antes** de subir/dar deploy.

---

## 5. Testando

1. Abra o link do Netlify → tela de **Perfil**.
2. Crie uma conta (e-mail/senha), adicione alguns personagens e defina a constelação de cada um.
3. Clique em **Draft** no menu superior → configure pontuação, número de personagens/armas, limite de 5★ e tempo → **Iniciar Draft**.
4. Os dados de personagens/armas devem aparecer com as imagens da planilha. Se aparecer erro de carregamento, revise o compartilhamento da planilha (passo 1.5).

---

## Estrutura de arquivos

```
confronto-abissal/
├── index.html          # login + perfil (Supabase)
├── draft.html           # ferramenta de draft (lê a planilha)
├── netlify.toml
├── css/
│   └── style.css
├── js/
│   ├── config.js         # ← preencher com Supabase URL/key
│   ├── supabaseClient.js
│   ├── sheets.js          # leitura da planilha (CSV público)
│   ├── auth.js            # login/perfil
│   └── draft.js           # lógica do draft
└── sql/
    └── schema.sql          # rodar uma vez no Supabase
```

## Personalizando pontuações e regras

- **Pontos de personagens/armas**: edite a coluna `Custo` na planilha.
- **Regras do draft** (orçamento total, nº de personagens/armas, limite de 5★, tempo por escolha): são configuráveis na própria tela de Draft antes de começar — não precisam de código.
