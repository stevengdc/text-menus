# Contexto do projeto — Menus de Texto

Este documento serve como ponto de partida para continuar o desenvolvimento da extensão noutro chat ou computador. Deve ser lido antes de alterar o código, juntamente com o `README.md`.

## Fonte oficial e fluxo de trabalho

- Repositório principal: <https://github.com/stevengdc/text-menus>
- Ramo principal: `main`
- Pasta habitual neste computador: `C:\Users\steven.camara\Extensões\text-menus`
- O GitHub é a fonte oficial do projeto, porque o desenvolvimento decorre em mais do que um computador.
- Antes de iniciar alterações, confirmar que não existem modificações locais por guardar e executar `git pull --ff-only origin main`.
- No fim, validar a extensão, criar um commit descritivo e executar `git push origin main`.
- Nunca substituir ou apagar alterações locais que ainda não estejam guardadas sem confirmar primeiro a sua origem.
- Não guardar chaves, credenciais, dados pessoais nem ficheiros de backup no repositório. A pasta `backups/` e os ficheiros JSON nela contidos devem continuar ignorados pelo Git.

## Objetivo da extensão

**Menus de Texto** é uma extensão Chrome Manifest V3 que permite criar uma árvore de menus e submenus com textos reutilizáveis. Ao clicar com o botão direito numa página e escolher um item, a extensão insere o respetivo conteúdo no campo que estava ativo.

Os itens podem conter:

- texto simples;
- HTML formatado, criado num editor visual ou editado diretamente no código-fonte.

A extensão foi pensada para ser simples para utilizadores menos técnicos. A página de opções apresenta uma árvore compacta, abre um editor separado para o conteúdo e inclui ajuda integrada.

## Estado atual

- Versão registada no `manifest.json`: **1.6.0**.
- Configuração guardada localmente através de `chrome.storage.local`.
- Não existe servidor, conta de utilizador, telemetria nem envio externo dos textos.
- A página de opções abre na primeira instalação e também ao clicar no ícone da extensão.
- É possível exportar e importar toda a configuração em JSON.
- A importação substitui a configuração atual apenas depois de validar o ficheiro e pedir confirmação.

Confirmar sempre estes dados no código, porque este documento deve ser atualizado quando a arquitetura ou o comportamento mudar.

## Estrutura do projeto

| Ficheiro/pasta | Responsabilidade |
| --- | --- |
| `manifest.json` | Manifest V3, permissões, ícones, serviço de fundo, página de opções e content script. |
| `background.js` | Cria e reconstrói os menus de contexto, procura o item escolhido e pede a inserção no separador/frame ativo. |
| `content.js` | Regista o último campo editável, preserva a seleção e insere texto ou HTML em inputs, textareas e editores rich-text. |
| `options/options.html` | Estrutura da página de opções, ajuda, modelos da árvore e diálogo do editor. |
| `options/options.css` | Aspeto compacto da árvore, colunas, botões e editor inspirado em barras de ferramentas como a do CKEditor. |
| `options/options.js` | Gestão da configuração, renderização e ordenação da árvore, integração TinyMCE, sanitização, gravação e backups. |
| `icons/` | Ícones PNG usados pelo Chrome e ficheiros SVG auxiliares. O manifest usa os PNG. |
| `vendor/tinymce/` | TinyMCE 8.8.2, respetivos plugins, estilos e tradução, incluídos localmente para cumprir o Manifest V3. |
| `README.md` | Descrição pública, funcionalidades, instalação, utilização e privacidade. |

## Modelo de dados

A configuração tem esta forma geral:

```json
{
  "generalTitle": "Menus de Texto",
  "menus": [
    {
      "id": "identificador-unico",
      "type": "menu",
      "title": "Atendimento",
      "children": []
    },
    {
      "id": "outro-identificador-unico",
      "type": "item",
      "title": "Saudação",
      "contentType": "text",
      "text": "Olá! Como posso ajudar?"
    }
  ]
}
```

Regras importantes:

- todos os nós têm um `id` único;
- um menu tem `type: "menu"` e uma lista `children`;
- um item tem `type: "item"`, `text` e `contentType: "text"` ou `"html"`;
- itens antigos sem `contentType` continuam compatíveis: o tipo é inferido a partir do conteúdo;
- `DEFAULT_CONFIG` existe em `background.js` e em `options/options.js`; manter ambas as cópias sincronizadas.

## Fluxos principais

### Construção dos menus de contexto

1. Na instalação, no arranque do Chrome ou quando a configuração muda, `background.js` lê `chrome.storage.local`.
2. Os menus anteriores são removidos.
3. A árvore é percorrida e os menus de contexto são criados sequencialmente, preservando a hierarquia e a ordem.

### Inserção de conteúdo

1. `content.js` regista o último campo editável e a seleção no documento ou frame.
2. O utilizador abre **Menus de Texto** com o botão direito e escolhe um item.
3. `background.js` encontra o item pelo ID e envia uma mensagem ao frame correto.
4. `content.js` restaura o foco/seleção e insere o conteúdo.
5. Em campos de texto, HTML é convertido em texto. Em editores rich-text, HTML permitido é inserido como HTML.
6. São emitidos eventos de edição para que aplicações modernas reconheçam a alteração.

### Edição e gravação

1. A árvore da página de opções permite criar, renomear, mover, reordenar e apagar nós.
2. O conteúdo de um item abre num diálogo amplo, evitando aumentar a altura da árvore.
3. É possível alternar entre texto simples e HTML; no modo HTML existem o editor TinyMCE visual e a vista de código-fonte.
4. A barra TinyMCE inclui fonte, tamanho, cores, estilos, rasurado, listas, alinhamento, links, tabelas e imagens locais.
5. Ao guardar, o HTML é sanitizado e a configuração é persistida em `chrome.storage.local`.
6. A alteração no armazenamento faz o serviço de fundo reconstruir os menus de contexto.

## Backups

O formato exportado atualmente é:

```json
{
  "format": "menus-de-texto-backup",
  "version": 1,
  "exportedAt": "data ISO",
  "config": {}
}
```

A importação aceita este invólucro ou uma configuração válida sem invólucro. Antes de substituir os dados deve:

1. ler e interpretar o JSON;
2. validar a estrutura e a unicidade dos IDs;
3. normalizar os dados antigos;
4. sanitizar conteúdos HTML;
5. pedir confirmação ao utilizador.

Os backups podem conter informação sensível escrita pelo utilizador. Nunca incluir exemplos reais, backups pessoais ou ficheiros `backups/*.json` no Git.

## Segurança e compatibilidade

- Manter a sanitização de HTML em profundidade: na importação, ao guardar e antes da inserção.
- Não permitir scripts, atributos de eventos (`onclick`, etc.), URLs `javascript:` ou outros conteúdos executáveis.
- Imagens inseridas pelo editor são locais, limitadas a 2 MB por imagem e guardadas como data URI; imagens HTTPS também são aceites pela sanitização atual.
- A gravação é impedida perto do limite de `chrome.storage.local` (95% da quota disponível).
- A extensão necessita de acesso às páginas para inserir conteúdo no campo ativo, incluindo editores em frames.
- Manter compatibilidade com inputs, textareas, `contenteditable` e frames usados por aplicações como o Salesforce.
- O editor ainda usa `document.execCommand` para comandos rich-text simples. Embora seja uma API antiga, permanece por compatibilidade; existe uma alternativa baseada em `Range` para a inserção de conteúdo.
- O TinyMCE funciona localmente em modo GPL ou com uma chave comercial self-hosted opcional guardada separadamente em `chrome.storage.local`. A chave não pertence à configuração nem aos backups.
- Por causa das restrições CSP das extensões Manifest V3, não adicionar JavaScript remoto, bibliotecas por CDN nem código JavaScript inline. Qualquer dependência futura deve ficar empacotada localmente.

## Validação antes de publicar

Validação automática mínima:

```powershell
node --check background.js
node --check content.js
node --check options/options.js
Get-Content manifest.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

Teste manual recomendado no Chrome:

- recarregar a extensão em `chrome://extensions` e confirmar que não existem erros;
- abrir a página de opções pelo ícone;
- criar, editar, mover, reordenar, aninhar e apagar menus e itens;
- verificar o alinhamento fixo das colunas e das ações na árvore;
- inserir texto num input e numa textarea;
- inserir texto e HTML num editor `contenteditable` e, se possível, num editor dentro de um frame;
- alternar texto/HTML e visual/código sem perder conteúdo;
- testar fonte, tamanho, cor, estilos, rasurado, alinhamento, listas, links, tabela e imagem;
- exportar um backup, alterar a configuração e importá-lo novamente;
- rejeitar um backup inválido sem destruir a configuração existente;
- confirmar que alterações guardadas aparecem imediatamente no menu de contexto;
- numa instalação realmente nova, confirmar que a página de opções abre automaticamente.

## Convenções para alterações futuras

- Preservar a interface em português de Portugal e uma experiência acessível a utilizadores não técnicos.
- Manter a árvore compacta; conteúdos extensos devem continuar a ser editados num diálogo separado.
- Atualizar o `README.md` quando uma funcionalidade visível muda.
- Atualizar este documento quando mudarem a arquitetura, o modelo de dados, o fluxo de sincronização ou as regras de segurança.
- Atualizar a versão no `manifest.json` quando for criada uma nova versão distribuível.
- Antes do commit, rever `git diff` para evitar ficheiros pessoais, backups ou alterações não relacionadas.
