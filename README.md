# Menus de Texto

Extensão para Google Chrome que permite criar menus e submenus personalizados com textos reutilizáveis. Ao clicar com o botão direito numa página, pode inserir rapidamente texto normal ou HTML no campo que estiver selecionado.

## Funcionalidades

- Criação de menus, submenus e itens de texto/HTML.
- Organização por arrastar e largar ou através dos botões de ordenação.
- Inserção em campos de texto e editores rich-text, incluindo editores dentro de frames.
- Nome personalizável para o menu de contexto.
- Gravação automática das alterações no armazenamento local do Chrome.
- Exportação e importação de um backup completo em formato JSON.
- Página de configuração aberta automaticamente na primeira instalação.
- Ajuda integrada, apresentada na primeira utilização e acessível pelo botão **Ajuda**.
- Árvore de menus compacta, com resumo e tipo de cada conteúdo.
- Editor amplo para texto simples, HTML visual e código-fonte.

## Instalação manual

1. Abra `chrome://extensions` no Google Chrome.
2. Ative o **Modo de programador**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta desta extensão.

## Configuração e utilização

1. Clique no ícone da extensão para abrir a página de configuração.
2. Crie menus, submenus e itens através dos botões disponíveis.
3. Dê um nome a cada item e escreva o respetivo texto ou HTML.
4. As alterações são guardadas automaticamente.
5. Numa página, coloque o cursor no campo pretendido, clique com o botão direito e escolha o item em **Menus de Texto**.

## Backup dos textos

Na página de configuração existem duas opções:

- **Exportar backup** descarrega um ficheiro JSON com o nome do menu, toda a estrutura de menus e todos os textos.
- **Importar backup** permite escolher um ficheiro JSON anteriormente exportado. O ficheiro é validado e é pedida confirmação antes de substituir a configuração atual.

É aconselhável guardar o backup num local seguro, especialmente antes de reinstalar a extensão, limpar os dados do Chrome ou fazer alterações importantes.

> A importação substitui todos os menus e textos atuais. Exporte primeiro um backup se pretender conservar a configuração existente.

## Formato e privacidade

Os dados são guardados localmente através de `chrome.storage.local`. A extensão não envia os textos para serviços externos. O backup é um ficheiro JSON legível e pode conter informação sensível presente nos snippets; proteja-o em conformidade.

## Permissões

- **contextMenus**: cria os menus apresentados ao clicar com o botão direito.
- **storage**: guarda a configuração localmente.
- **tabs** e **scripting**: permitem inserir o texto na página e no frame atualmente selecionado.
- **Acesso aos sites**: necessário para a inserção funcionar nas páginas onde a extensão é utilizada.

## Versão

Versão 1.4.0 — inclui árvore compacta e um editor de conteúdo para texto simples, HTML visual e código-fonte.
