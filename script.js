/* ==========================================================
   JUNTOS À MESA — script.js
   Todo o funcionamento usa o localStorage do navegador.
   ========================================================== */
document.addEventListener('DOMContentLoaded', () => {

  // 1) ARMAZENAMENTO LOCAL
  // nomes das chaves usadas no localStorage
  const CHAVES = { usuarios: 'jm_usuarios', sessao: 'token', doacoes: 'jm_doacoes' };
  const CATEGORIAS = { Panificados: '🥖', Hortifruti: '🥬', Frutas: '🍎', Laticínios: '🧀', Grãos: '🌾', Outros: '🍽️' };

  const ler = (chave, padrao) => {
    try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
  };
  const salvar = (chave, valor) => localStorage.setItem(chave, JSON.stringify(valor));

  const obterUsuarios = () => ler(CHAVES.usuarios, []);
  const obterDoacoes = () => ler(CHAVES.doacoes, []);
  // Sessão: guarda só o e-mail de quem entrou

  // ===== AUTENTICAÇÃO SIMULADA COM JWT (somente no front-end, sem back-end) =====
  // A chave abaixo é demonstrativa e pública (a mesma do laboratório) e serve para conferir a assinatura no jwt.io.
  // Em um sistema real, o token seria assinado no servidor e a chave nunca ficaria no navegador.
  const SEGREDO_DEMO = 'my-secret-key', SEGUNDOS_VALIDADE = 3600; // o token vale 1 hora
  const cripto = window.crypto?.subtle;
  const ERRO_CRIPTO = 'Este navegador não permite gerar o token. Abra o site por https, localhost ou direto pelo arquivo.';
  const MOTIVOS = {
    ausente: 'Nenhum token encontrado. Faça login para acessar.',
    vazio: 'O token armazenado está vazio.',
    estrutura: 'O token tem uma estrutura incorreta (esperado: header.payload.signature).',
    decodificacao: 'Não foi possível decodificar o payload do token (Base64URL inválido).',
    json: 'O conteúdo decodificado do token não é um JSON válido.',
    assinatura: 'A assinatura não confere: o conteúdo do token foi alterado.',
    expirado: 'O token expirou. Faça login novamente.'
  };
  let sessao = null;          // token já validado: { token, partes, cabecalho, payload }
  let motivoNegado = 'ausente'; // por que o acesso foi negado (mostrado ao usuário)

  // Base64URL: Base64 com "-" e "_" e sem "=" (é codificação, não criptografia)
  const paraBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const textoParaBase64Url = (texto) => paraBase64Url(new TextEncoder().encode(texto));
  function base64UrlParaTexto(parte) {
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/'), preenchido = b64 + '='.repeat((4 - b64.length % 4) % 4);
    return new TextDecoder().decode(Uint8Array.from(atob(preenchido), c => c.charCodeAt(0)));
  }
  async function assinar(dados) { // assinatura HS256: HMAC-SHA256 de "header.payload" com a chave demonstrativa
    if (!cripto) throw new Error('sem-cripto');
    const chave = await cripto.importKey('raw', new TextEncoder().encode(SEGREDO_DEMO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return paraBase64Url(new Uint8Array(await cripto.sign('HMAC', chave, new TextEncoder().encode(dados))));
  }
  async function gerarToken(usuario) { // header.payload.signature
    const agora = Math.floor(Date.now() / 1000);
    const cabecalho = textoParaBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const corpo = textoParaBase64Url(JSON.stringify({ id: usuario.id, name: usuario.nome, role: usuario.tipo === 'ong' ? 'ONG' : 'Doador', iat: agora, exp: agora + SEGUNDOS_VALIDADE }));
    return `${cabecalho}.${corpo}.${await assinar(cabecalho + '.' + corpo)}`;
  }
  // Confere o token e devolve { ok: true, ... } ou { ok: false, motivo }
  async function validarToken(token) {
    const negar = (motivo) => ({ ok: false, motivo });
    if (token === null) return negar('ausente');
    if (token.trim() === '') return negar('vazio');
    const partes = token.split('.');
    if (partes.length !== 3 || partes.some(p => !p)) return negar('estrutura');
    let cabecalho, payload;
    try { cabecalho = base64UrlParaTexto(partes[0]); payload = base64UrlParaTexto(partes[1]); } catch { return negar('decodificacao'); }
    try { cabecalho = JSON.parse(cabecalho); payload = JSON.parse(payload); } catch { return negar('json'); }
    if (!cabecalho || cabecalho.alg !== 'HS256' || !payload || typeof payload !== 'object' || !payload.id || !payload.name) return negar('estrutura');
    if (await assinar(partes[0] + '.' + partes[1]) !== partes[2]) return negar('assinatura');
    if (!payload.exp || payload.exp * 1000 <= Date.now()) return negar('expirado');
    return { ok: true, token, partes, cabecalho, payload };
  }
  async function iniciarSessao(usuario) { // login: gera o token, guarda no localStorage (chave "token") e valida
    const token = await gerarToken(usuario);
    localStorage.setItem(CHAVES.sessao, token);
    sessao = await validarToken(token);
  }
  async function restaurarSessao() { // ao abrir o site: confere o token que já estava salvo
    const token = localStorage.getItem(CHAVES.sessao);
    if (token === null) return;
    const resultado = await validarToken(token);
    if (resultado.ok) sessao = resultado;
    else { motivoNegado = resultado.motivo; avisar('✖ Acesso negado: ' + MOTIVOS[resultado.motivo]); }
  }
  function encerrarSessao() { // logout: remove o token
    localStorage.removeItem(CHAVES.sessao);
    sessao = null; motivoNegado = 'ausente';
  }
  function usuarioLogado() { // devolve a conta do token válido, ou null se não há sessão ou se o token expirou
    if (!sessao) return null;
    if (sessao.payload.exp * 1000 <= Date.now()) { sessao = null; motivoNegado = 'expirado'; avisar('✖ ' + MOTIVOS.expirado); return null; }
    return obterUsuarios().find(u => u.id === sessao.payload.id) || null;
  }

  // Senhas nunca ficam em texto puro: guardamos apenas o hash (sal + SHA-256)
  const gerarSal = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  async function gerarHash(senha, sal) {
    if (!cripto) throw new Error('sem-cripto');
    const resumo = await cripto.digest('SHA-256', new TextEncoder().encode(sal + senha));
    return Array.from(new Uint8Array(resumo), b => b.toString(16).padStart(2, '0')).join('');
  }

  // ===== ÁREA RESTRITA: boas-vindas e visualização do JWT =====
  const dataHora = (segundos) => new Date(segundos * 1000).toLocaleString('pt-BR');
  function desenharSessao(idBoasVindas, idJwt) {
    if (!sessao) return;
    const { partes, cabecalho, payload } = sessao, json = (obj) => escapar(JSON.stringify(obj, null, 2));
    $(idBoasVindas).innerHTML = `<span class="selo-acesso">✔ Acesso permitido</span>Bem-vindo(a), <strong>${escapar(payload.name)}</strong>!`;
    $(idJwt).innerHTML = `<details><summary>Autenticação simulada com JWT</summary>
      <p class="pequeno">Assinatura verificada com a chave demonstrativa <code>${SEGREDO_DEMO}</code>. Emitido em ${dataHora(payload.iat)}; válido até <strong>${dataHora(payload.exp)}</strong>.</p>
      <p class="jwt-token"><span class="jwt-h">${escapar(partes[0])}</span>.<span class="jwt-p">${escapar(partes[1])}</span>.<span class="jwt-s">${escapar(partes[2])}</span></p>
      <div class="jwt-grade">
        <div><p class="jwt-rotulo">Header</p><pre>${json(cabecalho)}</pre></div>
        <div><p class="jwt-rotulo">Payload (claims)</p><pre>${json(payload)}</pre></div>
        <div><p class="jwt-rotulo">Signature</p><pre>HMACSHA256(\n  base64UrlEncode(header) + "." +\n  base64UrlEncode(payload),\n  ${SEGREDO_DEMO}\n)</pre></div>
      </div>
      <div class="linha-botoes"><button class="botao botao-contorno" type="button" data-copiar-token>Copiar token</button><a class="botao botao-contorno" href="https://jwt.io" target="_blank" rel="noopener">Abrir jwt.io</a></div>
      <p class="pequeno">JWT não é senha, e Base64URL não é criptografia: quem tem o token lê o payload, mas não o altera sem invalidar a assinatura. A chave acima é pública e demonstrativa; em um sistema real a assinatura é feita no servidor.</p></details>`;
  }
  document.addEventListener('click', async (e) => { // botão "Copiar token"
    if (!e.target.closest('[data-copiar-token]') || !sessao) return;
    try { await navigator.clipboard.writeText(sessao.token); avisar('✔ Token copiado. Cole no jwt.io e use a chave ' + SEGREDO_DEMO + ' para verificar.'); }
    catch { avisar('Não foi possível copiar. Use F12 → Application → Local Storage → chave "token".'); }
  });

  // 2) UTILITÁRIOS
  const $ = (id) => document.getElementById(id);
  const todos = (seletor) => Array.from(document.querySelectorAll(seletor));
  const escapar = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const apenasNumeros = (t) => String(t).replace(/\D/g, '');

  const debounce = (fn, atraso = 250) => { let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), atraso); }; };
  function avisar(mensagem) {
    const aviso = document.createElement('p');
    aviso.textContent = mensagem;
    $('avisos').appendChild(aviso);
    setTimeout(() => aviso.remove(), 7000);
  }
  function confirmar(mensagem) {
    return new Promise((resolver) => {
      $('confirmarTexto').textContent = mensagem;
      $('modalConfirmar').hidden = false;
      $('confirmarSim').focus();
      const fechar = (resposta) => { $('modalConfirmar').hidden = true; resolver(resposta); };
      $('confirmarSim').onclick = () => fechar(true);
      $('confirmarNao').onclick = () => fechar(false);
    });
  }

  // 3) NAVEGAÇÃO ENTRE TELAS
  let telaAtual = 'inicio'; // tela visível (usada pelo botão "Voltar" da página de termos)
  function mostrarTela(nome) {
    if ((nome === 'ong' || nome === 'empresa') && !usuarioLogado()) return negarAcesso(); // área restrita
    telaAtual = nome;
    todos('.tela').forEach(t => t.hidden = t.id !== 'tela-' + nome);
    // login e cadastro ficam sem menu e sem rodapé (só o link "Voltar ao site")
    document.querySelector('.cabecalho').hidden = nome === 'auth';
    document.querySelector('.rodape').hidden = nome === 'auth';
    // nas telas funcionais (ONG e empresa) o menu some: sobra só o "Voltar à tela inicial" (e o "Sair")
    const funcional = nome === 'ong' || nome === 'empresa';
    document.querySelector('.menu-lista').hidden = funcional;
    $('btnPainel').hidden = funcional;
    $('voltarInicio').hidden = !funcional;
    fecharMenu();
    window.scrollTo(0, 0);
    if (nome === 'inicio') renderizarInicio();
    if (nome === 'ong') renderizarPainelOng();
    if (nome === 'empresa') renderizarPainelEmpresa();
  }
  function irParaPainel() {
    const u = usuarioLogado();
    if (!u) return negarAcesso();
    mostrarTela(u.tipo === 'ong' ? 'ong' : 'empresa');
  }
  function negarAcesso() { // acesso negado: abre o login e mostra o motivo
    abrirAuth('login');
    $('loginNegado').textContent = '✖ Acesso negado. ' + MOTIVOS[motivoNegado];
    $('loginNegado').hidden = false;
  }
  function abrirAuth(modo, tipo) {
    $('loginNegado').hidden = true;
    $('formLogin').hidden = modo !== 'login';
    $('formRedefinir').hidden = modo !== 'redefinir';
    $('formCadastro').hidden = modo !== 'cadastro';
    if (tipo) definirTipoCadastro(tipo);
    mostrarTela('auth');
  }
  // Links do menu/rodapé: voltam para o início e rolam até a seção
  todos('[data-tela="inicio"]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    mostrarTela('inicio');
    const alvo = document.querySelector(a.getAttribute('href'));
    if (alvo) alvo.scrollIntoView();
    fecharMenu();
  }));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cadastro]');
    if (b) { e.preventDefault(); abrirAuth('cadastro', b.dataset.cadastro); fecharMenu(); }
  });
  todos('[data-ir]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); abrirAuth(a.dataset.ir); }));
  // Privacidade e Termos de Uso: abrem em uma tela própria e o "Voltar" retorna de onde a pessoa veio
  let telaAntes = 'inicio';
  function mostrarPainelLegal(qual) {
    todos('#tela-legal [data-painel]').forEach(p => { p.hidden = p.dataset.painel !== qual; });
    todos('#tela-legal [data-legal-aba]').forEach(b => {
      const ativo = b.dataset.legalAba === qual;
      b.classList.toggle('ativo', ativo); b.setAttribute('aria-pressed', String(ativo));
    });
  }
  function abrirLegal(qual) {
    if (telaAtual !== 'legal') telaAntes = telaAtual;
    mostrarTela('legal');
    mostrarPainelLegal(qual);
  }
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-legal]'), aba = e.target.closest('[data-legal-aba]');
    if (link) { e.preventDefault(); abrirLegal(link.dataset.legal); fecharMenu(); }
    if (aba) mostrarPainelLegal(aba.dataset.legalAba);
  });
  $('legalVoltar').addEventListener('click', () => mostrarTela(telaAntes));
  $('btnEntrar').addEventListener('click', () => { abrirAuth('login'); fecharMenu(); });
  $('btnCadastrar').addEventListener('click', () => { abrirAuth('cadastro'); fecharMenu(); });
  $('btnPainel').addEventListener('click', () => { irParaPainel(); fecharMenu(); });
  $('btnSair').addEventListener('click', () => { encerrarSessao(); atualizarCabecalho(); mostrarTela('inicio'); avisar('✔ Logout realizado. Token removido do localStorage.'); fecharMenu(); });

  $('verTodas').addEventListener('click', (e) => { e.preventDefault(); irParaPainel(); });

  // 4) MENU MOBILE (HAMBÚRGUER)
  const hamburguer = $('hamburguer'), menu = $('menu');
  function fecharMenu() { menu.classList.remove('aberto'); hamburguer.setAttribute('aria-expanded', 'false'); }
  hamburguer.addEventListener('click', () => {
    const aberto = menu.classList.toggle('aberto');
    hamburguer.setAttribute('aria-expanded', String(aberto));
  });

  function atualizarCabecalho() {
    const u = usuarioLogado();
    $('acoesVisitante').hidden = !!u;
    $('acoesUsuario').hidden = !u;
    $('etiquetaUsuario').hidden = !u;
    if (u) $('etiquetaUsuario').textContent = u.nome;
  }

  // 5) MODAL DE INTRODUÇÃO (ONBOARDING)
  const passos = todos('#modalIntro .passo'), bolinhas = todos('#introProgresso span');
  let passoAtual = 1;
  function desenharPasso() {
    passos.forEach((p, i) => p.classList.toggle('ativo', i + 1 === passoAtual));
    bolinhas.forEach((b, i) => b.classList.toggle('ativo', i + 1 === passoAtual));
    $('introVoltar').hidden = passoAtual === 1;
    const ultimo = passoAtual === passos.length;
    $('introProximo').textContent = ultimo ? 'Começar agora →' : 'Próximo →';
    $('introProximo').className = 'botao ' + (ultimo ? 'botao-verde' : 'botao-primario');
    $('modalIntro').style.setProperty('--pg', (passoAtual / passos.length * 100) + '%');
  }
  function abrirIntro() { passoAtual = 1; desenharPasso(); $('modalIntro').hidden = false; document.body.style.overflow = 'hidden'; }
  function fecharIntro() { $('modalIntro').hidden = true; document.body.style.overflow = ''; }
  $('introProximo').addEventListener('click', () => { passoAtual < passos.length ? (passoAtual++, desenharPasso()) : fecharIntro(); });
  $('introVoltar').addEventListener('click', () => { if (passoAtual > 1) { passoAtual--; desenharPasso(); } });
  $('introFechar').addEventListener('click', fecharIntro);
  $('modalIntro').addEventListener('click', (e) => { if (e.target === $('modalIntro')) fecharIntro(); });
  $('botaoAjuda').addEventListener('click', abrirIntro);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharIntro(); fecharZap(); if (!$('modalConfirmar').hidden) $('confirmarNao').click(); } });

  // 6) ALTERNADORES ONG / DOADOR
  let tipoCadastro = 'ong';
  function definirTipoCadastro(tipo) {
    tipoCadastro = tipo;
    todos('[data-alternador] button').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === tipo));
    const ong = tipo === 'ong';
    $('rotuloNome').textContent = ong ? 'Nome da ONG' : 'Nome do estabelecimento';
    $('cadNome').placeholder = ong ? 'Instituto Solidário' : 'Padaria Central';
    $('cadEnviar').textContent = ong ? 'Criar conta como ONG' : 'Cadastrar meu estabelecimento';
    $('cadEnviar').className = 'botao botao-bloco ' + (ong ? 'botao-verde' : 'botao-primario');
    $('cadTitulo').textContent = ong ? 'Cadastro para ONGs' : 'Cadastro para Doadores';
    $('cadDescricao').textContent = ong ? 'Acesse o formulário completo de cadastro para ONGs.' : 'Acesse o formulário completo de cadastro para estabelecimentos doadores.';
    $('cadBotao').textContent = ong ? 'Criar conta ONG →' : 'Criar conta Doador →';
    $('cadBotao').className = 'botao botao-grande ' + (ong ? 'botao-verde' : 'botao-primario');
  }
  todos('[data-alternador] button').forEach(b => b.addEventListener('click', () => definirTipoCadastro(b.dataset.tipo)));
  $('cadBotao').addEventListener('click', () => abrirAuth('cadastro', tipoCadastro));
  $('cadEntrar').addEventListener('click', (e) => { e.preventDefault(); abrirAuth('login'); });

  // 7) CADASTRO E LOGIN
  // 7.1) FORÇA DA SENHA
  const REQUISITOS_SENHA = [
    ['8 ou mais caracteres', (s) => s.length >= 8],
    ['letra minúscula', (s) => /[a-z]/.test(s)],
    ['letra maiúscula', (s) => /[A-Z]/.test(s)],
    ['número', (s) => /\d/.test(s)],
    ['símbolo (ex.: ! @ #)', (s) => /[^A-Za-z0-9]/.test(s)]
  ];
  // fraca: menos de 4 requisitos ou menos de 8 caracteres | média: 4 requisitos | forte: todos
  function avaliarSenha(senha) {
    const faltando = REQUISITOS_SENHA.filter(([, atende]) => !atende(senha)).map(([nome]) => nome);
    const pontos = REQUISITOS_SENHA.length - faltando.length;
    const nivel = faltando.length === 0 ? 'forte' : (pontos >= 4 && senha.length >= 8 ? 'media' : 'fraca');
    return { nivel, faltando };
  }
  function ligarMedidor(idCampo, idMedidor) {
    const campo = $(idCampo), medidor = $(idMedidor), texto = medidor.querySelector('small');
    const atualizar = () => {
      const { nivel, faltando } = avaliarSenha(campo.value);
      medidor.dataset.nivel = campo.value ? nivel : '';
      texto.textContent = !campo.value ? 'Use 8+ caracteres com maiúscula, minúscula, número e símbolo.'
        : nivel === 'forte' ? 'Senha forte ✔' : `Senha ${nivel === 'media' ? 'média' : 'fraca'} — falta: ${faltando.join(', ')}.`;
    };
    campo.addEventListener('input', atualizar);
    campo.form.addEventListener('reset', () => setTimeout(atualizar));
    atualizar();
  }
  ligarMedidor('cadSenha', 'forcaCadastro');
  ligarMedidor('redSenha', 'forcaRedefinir');

  // 7.2) VALIDAÇÃO DO CADASTRO (lógica separada da interface)
  const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const textoMinimo = (n) => (valor) => valor.trim().length >= n;
  // campo -> [função validadora, mensagem de erro]
  const REGRAS_CADASTRO = {
    cadNome: [textoMinimo(3), 'Informe o nome (mínimo 3 caracteres).'],
    cadCnpj: [(v) => apenasNumeros(v).length === 14, 'O CNPJ precisa ter 14 dígitos.'],
    cadResponsavel: [textoMinimo(3), 'Informe o nome do responsável.'],
    cadTelefone: [(v) => apenasNumeros(v).length >= 10, 'Informe o telefone com DDD.'],
    cadBairro: [textoMinimo(2), 'Informe o bairro ou CEP.'],
    cadEmail: [(v) => REGEX_EMAIL.test(v.trim()), 'Use o formato nome@dominio.com.'],
    cadSenha: [(v) => avaliarSenha(v).nivel === 'forte', 'A senha precisa ser forte.'],
    cadSenha2: [(v) => v !== '' && v === $('cadSenha').value, 'As senhas não conferem.']
  };
  // Interface: classes, aria-invalid e mensagem curta abaixo do campo
  function mostrarEstadoCampo(campo, valido, mensagem) {
    campo.classList.toggle('valido', valido);
    campo.classList.toggle('invalido', !valido);
    campo.setAttribute('aria-invalid', String(!valido));
    let dica = $('dica-' + campo.id);
    if (!dica && campo.id !== 'cadSenha') {
      dica = document.createElement('small');
      dica.id = 'dica-' + campo.id; dica.className = 'dica'; dica.setAttribute('aria-live', 'polite');
      campo.insertAdjacentElement('afterend', dica);
      campo.setAttribute('aria-describedby', dica.id);
    }
    if (dica) dica.textContent = valido ? '' : mensagem;
  }
  function validarCampo(id) {
    const [valida, mensagem] = REGRAS_CADASTRO[id], valido = valida($(id).value);
    mostrarEstadoCampo($(id), valido, mensagem);
    return valido;
  }
  Object.keys(REGRAS_CADASTRO).forEach((id) => {
    $(id).addEventListener('blur', () => validarCampo(id));
    $(id).addEventListener('input', () => { if ($(id).getAttribute('aria-invalid') === 'true') validarCampo(id); });
  });
  $('cadSenha').addEventListener('input', () => { if ($('cadSenha2').value) validarCampo('cadSenha2'); });
  $('formCadastro').addEventListener('reset', () => setTimeout(() => {
    todos('#formCadastro .valido, #formCadastro .invalido').forEach(c => c.classList.remove('valido', 'invalido'));
    todos('#formCadastro .dica').forEach(d => { d.textContent = ''; });
  }));

  $('formCadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalidos = Object.keys(REGRAS_CADASTRO).filter((id) => !validarCampo(id));
    const erros = invalidos.map((id) => REGRAS_CADASTRO[id][1]);
    const email = $('cadEmail').value.trim().toLowerCase(), usuarios = obterUsuarios();
    if (!$('cadTermos').checked) erros.push('Aceite os Termos de Uso para continuar.');
    if (!erros.length && usuarios.some(u => u.email === email)) erros.push('Já existe uma conta com este e-mail.');
    $('cadErro').textContent = erros.join(' '); // região role="alert": o leitor de tela anuncia todos os erros
    if (erros.length) { (invalidos.length ? $(invalidos[0]) : $(!$('cadTermos').checked ? 'cadTermos' : 'cadEmail')).focus(); return; }
    try {
      const sal = gerarSal();
      const usuario = {
        id: Date.now(), tipo: tipoCadastro, nome: $('cadNome').value.trim(), cnpj: $('cadCnpj').value.trim(),
        responsavel: $('cadResponsavel').value.trim(), telefone: $('cadTelefone').value.trim(),
        bairro: $('cadBairro').value.trim(), email, sal, senhaHash: await gerarHash($('cadSenha').value, sal)
      };
      await iniciarSessao(usuario); // gera e guarda o token JWT
      usuarios.push(usuario);
      salvar(CHAVES.usuarios, usuarios);
    } catch { $('cadErro').textContent = '✖ ' + ERRO_CRIPTO; return; }
    e.target.reset(); atualizarCabecalho();
    avisar('✔ Conta criada e login realizado! Token JWT armazenado no localStorage.');
    irParaPainel();
  });

  $('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginNegado').hidden = true;
    const email = $('loginEmail').value.trim().toLowerCase(), senha = $('loginSenha').value, erros = [];
    if (!email) erros.push('Informe o e-mail.');   // campos vazios: mensagens de erro na tela
    if (!senha) erros.push('Informe a senha.');
    if (erros.length) { $('loginErro').textContent = '✖ ' + erros.join(' '); $(email ? 'loginSenha' : 'loginEmail').focus(); return; }
    try {
      const usuario = obterUsuarios().find(u => u.email === email);
      const hash = usuario?.senhaHash ? await gerarHash(senha, usuario.sal) : null;
      if (!usuario?.senhaHash || hash !== usuario.senhaHash) { $('loginErro').textContent = '✖ E-mail ou senha incorretos.'; return; }
      await iniciarSessao(usuario); // login bem-sucedido: gera e guarda o token JWT
    } catch { $('loginErro').textContent = '✖ ' + ERRO_CRIPTO; return; }
    $('loginErro').textContent = '';
    e.target.reset(); atualizarCabecalho();
    avisar('✔ Login bem-sucedido! Token JWT armazenado no localStorage.');
    irParaPainel();
  });

  // Redefinição de senha (recuperação local de acesso)
  $('esqueciSenha').addEventListener('click', () => { $('redEmail').value = $('loginEmail').value; abrirAuth('redefinir'); });
  $('formRedefinir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuarios = obterUsuarios(), usuario = usuarios.find(u => u.email === $('redEmail').value.trim().toLowerCase());
    const erro = (m) => { $('redErro').textContent = m; };
    const forca = avaliarSenha($('redSenha').value);
    if (!usuario) return erro('Não encontramos uma conta com este e-mail.');
    if (forca.nivel !== 'forte') return erro('A senha precisa ser forte. Falta: ' + forca.faltando.join(', ') + '.');
    if ($('redSenha').value !== $('redSenha2').value) return erro('As senhas não conferem.');
    try {
      usuario.sal = gerarSal();
      usuario.senhaHash = await gerarHash($('redSenha').value, usuario.sal);
    } catch { return erro('✖ ' + ERRO_CRIPTO); }
    salvar(CHAVES.usuarios, usuarios);
    e.target.reset(); erro('');
    abrirAuth('login');
    $('loginErro').textContent = 'Senha redefinida! Faça login com a nova senha.';
  });

  // 8) CARTÕES DE ALIMENTOS
  const disponiveis = () => obterDoacoes().filter(d => !d.agendadoPor).sort((a, b) => b.urgente - a.urgente);

  function cartaoAlimento(d, acao, rotulo = 'Agendar Retirada') {
    const botao = acao === 'remover'
      ? `<button class="botao botao-contorno" data-remover="${d.id}" type="button">Remover doação</button>`
      : `<button class="botao botao-verde" data-agendar="${d.id}" type="button">${rotulo}</button>`;
    return `<article class="cartao cartao-alimento">
      <div class="alimento-foto"${d.foto ? ` style="background:url('${d.foto}') center/cover"` : ''}>${d.foto ? '' : (CATEGORIAS[d.categoria] || '🍽️')}
        ${d.urgente ? '<span class="selo">Urgente</span>' : ''}<span class="selo categoria">${escapar(d.categoria)}</span></div>
      <div class="alimento-corpo"><h3>${escapar(d.nome)}</h3>
        <p class="pequeno">${escapar(d.donoNome)} · ${escapar(d.bairro)}</p>
        <div class="alimento-meta"><span>📦 ${escapar(d.qtd)} ${escapar(d.unidade)}</span>
          <span class="${d.urgente ? 'urgente-texto' : ''}">⏰ ${escapar(d.validade)}</span></div>
        ${d.agendadoPor ? '<p class="pequeno">✔ Retirada agendada</p>' : botao}</div></article>`;
  }
  const estadoVazio = (icone, titulo, texto, botao = '') => `<div class="vazio"><div class="vazio-icone" aria-hidden="true">${icone}</div><h3>${titulo}</h3><p class="pequeno">${texto}</p>${botao}</div>`;

  // 9) TELA INICIAL: DOAÇÕES, PARCEIROS E MAPA
  const formatar = (n) => n.toLocaleString('pt-BR');

  // Números e avisos do hero, calculados a partir dos dados salvos
  function atualizarDestaquesInicio() {
    const doacoes = obterDoacoes(), usuarios = obterUsuarios();
    const realizadas = doacoes.filter(d => d.agendadoPor), abertas = doacoes.filter(d => !d.agendadoPor);
    const comDados = doacoes.length > 0;
    $('heroNumeros').hidden = !comDados;
    $('avisoInicio').hidden = comDados;
    $('numDoacoes').textContent = formatar(realizadas.length);
    $('numParceiros').textContent = formatar(usuarios.filter(u => u.tipo === 'doador').length);
    $('numOngs').textContent = formatar(usuarios.filter(u => u.tipo === 'ong').length);

    const kg = realizadas.filter(d => d.unidade === 'kg').reduce((soma, d) => soma + Number(d.qtd), 0);
    $('heroImpactoTitulo').textContent = kg > 0 ? 'IMPACTO ESTE MÊS' : 'PRONTO PARA COMEÇAR';
    $('heroImpacto').textContent = kg >= 1000 ? `${formatar(Math.round(kg / 100) / 10)} toneladas salvas do descarte`
      : kg > 0 ? `${formatar(kg)} kg salvos do descarte` : 'Sua doação pode ser a primeira';

    const nova = abertas[abertas.length - 1], ultima = realizadas[realizadas.length - 1];
    $('chipDoacao').hidden = !nova;
    if (nova) $('chipDoacao').innerHTML = `<small>● NOVA DOAÇÃO</small><strong>${escapar(nova.donoNome)}</strong><span>${escapar(nova.qtd)} ${escapar(nova.unidade)} · ${escapar(nova.validade)}</span>`;
    const ong = ultima && usuarios.find(u => u.email === ultima.agendadoPor);
    $('chipRetirada').hidden = !ong;
    if (ong) $('chipRetirada').innerHTML = `<strong>✓ Retirada confirmada</strong><span>${escapar(ong.nome)}</span>`;
  }

  function renderizarInicio() {
    atualizarDestaquesInicio();
    const lista = disponiveis().slice(0, 6);
    $('inicioDoacoes').innerHTML = lista.length ? lista.map(d => cartaoAlimento(d, 'agendar')).join('')
      : estadoVazio('🍽️', 'Seja o primeiro doador', 'Assim que um estabelecimento registrar o primeiro excedente, ele aparecerá aqui.', '<button class="botao botao-primario" data-cadastro="doador" type="button">Quero doar</button>');
    const ongs = obterUsuarios().filter(u => u.tipo === 'ong');
    $('inicioParceiros').innerHTML = ongs.length
      ? ongs.slice(0, 8).map(o => `<article class="cartao parceiro"><h3>🤝 ${escapar(o.nome)}</h3><p class="pequeno">${escapar(o.bairro)}</p></article>`).join('') + '<div class="linha-total"><button class="botao botao-fantasma" data-cadastro="ong" type="button">Cadastrar minha ONG</button></div>'
      : estadoVazio('🤝', 'Seja o primeiro parceiro', 'Ainda não há ONGs cadastradas. Junte-se a nós desde o início.', '<button class="botao botao-verde" data-cadastro="ong" type="button">Quero ser parceiro</button>');
    desenharMapa();
  }


  // 9.1) MAPA LOCAL (pinos posicionados pelo JavaScript, sem serviço externo)
  const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const hashTexto = (texto) => { let h = 7; for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };
  let pontoAberto = null; // e-mail do ponto selecionado

  // o bairro define a região do pino; o e-mail desloca um pouco para os pinos não se sobreporem
  function posicaoNoMapa(u) {
    const base = hashTexto(semAcento(u.bairro)), desvio = hashTexto(u.email);
    return { x: 12 + (base % 70) + (desvio % 15) - 7, y: 14 + (Math.floor(base / 70) % 66) + (Math.floor(desvio / 15) % 15) - 7 };
  }
  // ONGs e doadores que têm doação em aberto, filtrados pela busca (bairro ou CEP)
  function pontosDoMapa() {
    const comDoacao = new Set(disponiveis().map(d => d.donoEmail)), termo = semAcento($('mapaBusca').value.trim());
    return obterUsuarios().filter(u => (u.tipo === 'ong' || comDoacao.has(u.email)) && (!termo || semAcento(u.bairro).includes(termo)));
  }
  function desenharMapa() {
    const area = $('mapa-area'), pontos = pontosDoMapa(), buscando = $('mapaBusca').value.trim() !== '';
    if (!pontos.some(p => p.email === pontoAberto)) pontoAberto = null;
    area.querySelectorAll('.pino').forEach(p => p.remove());
    pontos.slice(0, buscando ? 60 : 18).forEach(u => { // limita os pinos para o mapa não ficar poluído
      const pos = posicaoNoMapa(u), pino = document.createElement('button');
      pino.type = 'button'; pino.dataset.ponto = u.email;
      pino.className = 'pino' + (u.tipo === 'ong' ? ' ong' : '') + (u.email === pontoAberto ? ' ativo' : '');
      pino.textContent = u.tipo === 'ong' ? '♥' : '🏪';
      pino.style.left = pos.x + '%'; pino.style.top = pos.y + '%';
      pino.setAttribute('aria-label', `${u.tipo === 'ong' ? 'ONG' : 'Doador'}: ${u.nome}, ${u.bairro}`);
      area.appendChild(pino);
    });
    $('mapaEtiqueta').textContent = `${formatar(pontos.length)} ${pontos.length === 1 ? 'ponto ativo' : 'pontos ativos'}`;
    mostrarDetalhePonto();
  }
  // painel abaixo do mapa com os dados do ponto selecionado
  function mostrarDetalhePonto() {
    const u = obterUsuarios().find(x => x.email === pontoAberto), caixa = $('mapaDetalhe');
    caixa.hidden = !u;
    if (!u) return;
    const itens = disponiveis().filter(d => d.donoEmail === u.email);
    const corpo = u.tipo === 'ong' ? '<p class="pequeno">Entidade parceira que retira os alimentos doados.</p>'
      : itens.length ? `<ul class="mapa-itens">${itens.map(d => `<li><span>${escapar(d.nome)} · ${escapar(d.qtd)} ${escapar(d.unidade)} · ${escapar(d.validade)}</span><button class="botao botao-verde" type="button" data-agendar="${d.id}">Agendar</button></li>`).join('')}</ul>`
      : '<p class="pequeno">Sem doações em aberto no momento.</p>';
    caixa.innerHTML = `<h3>${escapar(u.nome)}</h3><p class="pequeno">${u.tipo === 'ong' ? '🤝 ONG' : '🏪 Doador'} · ${escapar(u.bairro)}</p>${corpo}<button class="botao botao-contorno" type="button" id="mapaFechar">Fechar</button>`;
  }
  function selecionarPonto(email) { // marca o pino sem redesenhar, para o foco do teclado não se perder
    pontoAberto = pontoAberto === email ? null : email;
    $('mapa-area').querySelectorAll('.pino').forEach(p => p.classList.toggle('ativo', p.dataset.ponto === pontoAberto));
    mostrarDetalhePonto();
  }
  $('mapa-area').addEventListener('click', (e) => { const pino = e.target.closest('.pino'); if (pino) selecionarPonto(pino.dataset.ponto); });
  $('mapaDetalhe').addEventListener('click', (e) => { if (e.target.id === 'mapaFechar') selecionarPonto(pontoAberto); });
  $('mapaBuscar').addEventListener('click', desenharMapa);
  $('mapaBusca').addEventListener('input', debounce(desenharMapa));
  $('mapaBusca').addEventListener('keydown', (e) => { if (e.key === 'Enter') desenharMapa(); });


  // 10) PAINEL DA ONG
  let categoriaAtiva = 'Todos';
  function renderizarPainelOng() {
    const u = usuarioLogado(); if (!u) return;
    desenharSessao('ongBoasVindas', 'jwtOng');
    const todasDoacoes = obterDoacoes(), livres = disponiveis();
    $('ongMetricas').innerHTML = [
      [livres.length, 'Disponíveis agora'], [livres.filter(d => d.urgente).length, 'Urgentes (hoje)'],
      [todasDoacoes.filter(d => d.agendadoPor === u.email).length, 'Já agendados'],
      [new Set(livres.map(d => d.donoEmail)).size, 'Doadores ativos']
    ].map(([n, r]) => `<div class="metrica"><dt>${r}</dt><dd>${n}</dd></div>`).join('');

    $('ongCategorias').innerHTML = ['Todos', ...Object.keys(CATEGORIAS)]
      .map(c => `<button type="button" data-categoria="${c}" class="${c === categoriaAtiva ? 'ativo' : ''}">${c}</button>`).join('');

    const termo = $('ongBusca').value.trim().toLowerCase();
    const filtradas = livres.filter(d =>
      (categoriaAtiva === 'Todos' || d.categoria === categoriaAtiva) &&
      (!$('ongUrgentes').checked || d.urgente) &&
      (!termo || (d.nome + ' ' + d.donoNome).toLowerCase().includes(termo)));
    $('ongLista').innerHTML = filtradas.length ? filtradas.map(d => cartaoAlimento(d, 'agendar', 'Agendar pelo WhatsApp')).join('')
      : estadoVazio('🔎', 'Nenhuma doação encontrada', 'Ajuste os filtros ou volte mais tarde.');
  }
  $('ongCategorias').addEventListener('click', (e) => {
    if (e.target.dataset.categoria) { categoriaAtiva = e.target.dataset.categoria; renderizarPainelOng(); }
  });
  $('ongBusca').addEventListener('input', debounce(renderizarPainelOng));
  $('ongUrgentes').addEventListener('change', renderizarPainelOng);

  // 11) AGENDAMENTO VIA WHATSAPP
  let doacaoZap = null;
  function abrirZap(id) {
    const u = usuarioLogado();
    if (!u || u.tipo !== 'ong') { abrirAuth('login'); return avisar('Entre com uma conta de ONG para agendar retiradas.'); }
    const d = obterDoacoes().find(x => x.id === id), dono = obterUsuarios().find(x => x.email === d?.donoEmail);
    if (!d || !dono) return;
    doacaoZap = d;
    const fone = apenasNumeros(dono.telefone), numero = fone.length <= 11 ? '55' + fone : fone;
    const msg = `Olá! Sou da ${u.nome} e vi no Juntos à Mesa a doação "${d.nome}" (${d.qtd} ${d.unidade}). Podemos combinar a retirada?`;
    $('zapResumo').innerHTML = `<div class="resumo-miniatura"${d.foto ? ` style="background-image:url('${d.foto}')"` : ''}>${d.foto ? '' : (CATEGORIAS[d.categoria] || '🍽️')}</div><div><strong>${escapar(d.nome)}</strong><br><span class="pequeno">${escapar(d.donoNome)}<br>📦 ${escapar(d.qtd)} ${escapar(d.unidade)} · ⏰ ${escapar(d.validade)}</span></div>`;
    $('zapNota').innerHTML = `Ao continuar, o WhatsApp será aberto com uma mensagem pré-preenchida para <strong>${escapar(d.donoNome)}</strong>.`;
    $('zapLink').href = `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
    $('modalZap').hidden = false;
  }
  function fecharZap() { $('modalZap').hidden = true; }
  $('zapCancelar').addEventListener('click', fecharZap);
  $('zapLink').addEventListener('click', () => {
    const u = usuarioLogado(), doacoes = obterDoacoes(), d = doacoes.find(x => x.id === doacaoZap?.id);
    if (d && u) { d.agendadoPor = u.email; salvar(CHAVES.doacoes, doacoes); }
    fecharZap();
    setTimeout(() => mostrarTela($('tela-ong').hidden ? 'inicio' : 'ong'), 100);
  });
  document.addEventListener('click', (e) => { // clique nos botões "Agendar Retirada" de qualquer tela
    const alvo = e.target.closest('[data-agendar]');
    if (alvo) abrirZap(alvo.dataset.agendar);
  });

  // 12) PAINEL DA EMPRESA
  $('alCategoria').innerHTML = Object.keys(CATEGORIAS).map(c => `<option>${c}</option>`).join('');

  function renderizarPainelEmpresa() {
    const u = usuarioLogado(); if (!u) return;
    desenharSessao('empBoasVindas', 'jwtEmpresa');
    const minhas = obterDoacoes().filter(d => d.donoEmail === u.email), agendadas = minhas.filter(d => d.agendadoPor);
    const totalKg = agendadas.filter(d => d.unidade === 'kg').reduce((s, d) => s + Number(d.qtd), 0);
    $('empMetricas').innerHTML = [
      [minhas.length - agendadas.length, 'Doações ativas'], [agendadas.length, 'Agendamentos'],
      [totalKg, 'Total doado (kg)'], [new Set(agendadas.map(d => d.agendadoPor)).size, 'ONGs atendidas']
    ].map(([n, r]) => `<div class="metrica"><dt>${r}</dt><dd>${n}</dd></div>`).join('');
    $('empLista').innerHTML = minhas.length ? minhas.map(d => cartaoAlimento(d, 'remover')).join('')
      : estadoVazio('📦', 'Nenhum alimento cadastrado', 'Clique em "+ Adicionar Alimento" para publicar sua primeira doação.');
  }
  $('btnNovoAlimento').addEventListener('click', () => { $('formAlimento').hidden = !$('formAlimento').hidden; });
  $('alCancelar').addEventListener('click', () => { $('formAlimento').hidden = true; $('alErro').textContent = ''; });

  let fotoAlimento = '';
  $('alFoto').addEventListener('change', (e) => {
    const arquivo = e.target.files[0]; if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 600 / img.width), tela = document.createElement('canvas');
        tela.width = img.width * escala; tela.height = img.height * escala;
        tela.getContext('2d').drawImage(img, 0, 0, tela.width, tela.height);
        fotoAlimento = tela.toDataURL('image/jpeg', 0.7);
        $('alFotoTexto').textContent = '✔ Foto selecionada';
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
  $('formAlimento').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = usuarioLogado(); if (!u) return;
    const nome = $('alNome').value.trim(), qtd = $('alQtd').value, validade = $('alValidade').value.trim();
    if (!nome || !qtd || Number(qtd) <= 0 || !validade) { $('alErro').textContent = 'Preencha nome, quantidade e validade.'; return; }
    const doacoes = obterDoacoes();
    doacoes.push({
      id: 'd' + Date.now(), donoEmail: u.email, donoNome: u.nome, bairro: u.bairro,
      nome, qtd, unidade: $('alUnidade').value, validade, categoria: $('alCategoria').value,
      urgente: $('alUrgente').checked, agendadoPor: null, foto: fotoAlimento
    });
    salvar(CHAVES.doacoes, doacoes);
    e.target.reset(); fotoAlimento = ''; $('alFotoTexto').textContent = '📷 Clique para enviar uma foto'; $('alErro').textContent = ''; $('formAlimento').hidden = true;
    renderizarPainelEmpresa();
  });
  $('empLista').addEventListener('click', async (e) => {
    const id = e.target.dataset.remover;
    if (id && await confirmar('Remover esta doação?')) {
      salvar(CHAVES.doacoes, obterDoacoes().filter(d => d.id !== id));
      renderizarPainelEmpresa();
    }
  });

  // 12.1) CONTROLE DO PROJETO (dados de teste e limpeza)
  const DOMINIO_TESTE = '@teste.jm';

  $('btnGerarDados').addEventListener('click', () => {
    // gerador pseudoaleatório com semente fixa: os mesmos dados a cada clique
    let semente = 20261011;
    const sorteio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
    const entre = (a, b) => a + Math.floor(sorteio() * (b - a + 1));
    const escolher = (lista) => lista[entre(0, lista.length - 1)];
    const digitos = (n) => Array.from({ length: n }, () => entre(0, 9)).join('');
    const cnpj = () => { const d = digitos(14); return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`; };

    const bairros = ['Pinheiros', 'Vila Madalena', 'Lapa', 'Mooca', 'Tatuapé', 'Santana', 'Itaim Bibi', 'Moema', 'Perdizes', 'Butantã', 'Ipiranga', 'Penha', 'Santo Amaro', 'Vila Mariana', 'Liberdade', 'Bom Retiro'];
    const nomes = ['Marina', 'Carlos', 'Helena', 'Roberto', 'Fernanda', 'Paulo', 'Juliana', 'André', 'Camila', 'Ricardo'];
    const sobrenomes = ['Alves', 'Menezes', 'Prado', 'Lima', 'Costa', 'Ribeiro', 'Rocha', 'Nogueira', 'Teixeira', 'Barros'];
    const criar = (tipo, i, nome) => ({
      tipo, nome, bairro: escolher(bairros), responsavel: escolher(nomes) + ' ' + escolher(sobrenomes), cnpj: cnpj(),
      telefone: `(11) 9${digitos(4)}-${digitos(4)}`, email: `${tipo}${i + 1}${DOMINIO_TESTE}`, id: (tipo === 'ong' ? 1000 : 2000) + i, senhaHash: null // contas de teste não permitem login
    });

    // 98 ONGs e 230 estabelecimentos doadores
    const tiposOng = ['Instituto', 'Associação', 'Banco de Alimentos', 'Cozinha Comunitária', 'Projeto', 'Fundação', 'Casa de Apoio', 'Movimento'];
    const nomesOng = ['Alimento Solidário', 'Mesa Farta', 'Ação Contra a Fome', 'Prato Cheio', 'Esperança Viva', 'Pão Nosso', 'Semear', 'Mãos Unidas', 'Boa Colheita', 'Vida Plena', 'Dignidade', 'Nutrir', 'Mesa Aberta'];
    const tiposEmpresa = ['Padaria', 'Mercado', 'Supermercado', 'Hortifruti', 'Restaurante', 'Empório', 'Quitanda', 'Açougue', 'Rotisseria', 'Mercearia'];
    const nomesEmpresa = ['Sabor & Arte', 'Central', 'Família', 'São Paulo', 'Boa Safra', 'Estrela', 'Bom Preço', 'Vila Nova', 'Santa Clara', 'Dom Pedro', 'Real', 'Casa Verde', 'Panorama', 'Primavera', 'Ouro Fino', 'Recanto', 'Bela Vista', 'Imperial', 'Sol Nascente', 'Pátria', 'Mineiro', 'Paulista', 'Colonial'];
    const ongs = Array.from({ length: 98 }, (_, i) => criar('ong', i, `${tiposOng[i % 8]} ${nomesOng[Math.floor(i / 8)]}`));
    const empresas = Array.from({ length: 230 }, (_, i) => criar('doador', i, `${tiposEmpresa[i % 10]} ${nomesEmpresa[Math.floor(i / 10)]}`));
    const usuarios = [];
    empresas.forEach((empresa, i) => { if (ongs[i]) usuarios.push(ongs[i]); usuarios.push(empresa); });

    // doações: 4.800 já retiradas (histórico) e 36 em aberto
    const produtos = {
      Panificados: [['Pão integral e croissants', 'unidades', 10, 60], ['Pães franceses do dia', 'unidades', 20, 80], ['Bolos e roscas', 'unidades', 5, 25]],
      Hortifruti: [['Legumes e verduras frescas', 'kg', 3, 8], ['Tomates e cebolas', 'kg', 3, 8], ['Folhosas variadas', 'caixas', 2, 6]],
      Frutas: [['Caixas de frutas variadas', 'caixas', 2, 6], ['Maçãs e peras', 'kg', 3, 8], ['Bananas maduras', 'kg', 3, 8]],
      Laticínios: [['Iogurtes e queijos', 'unidades', 10, 40], ['Frios fatiados', 'kg', 2, 6], ['Leite longa vida', 'unidades', 12, 48]],
      Grãos: [['Arroz e feijão embalados', 'kg', 3, 8], ['Macarrão e farinhas', 'kg', 3, 8]]
    };
    const validades = ['Hoje, 18h', 'Hoje, 20h', 'Hoje, 22h', 'Amanhã, 10h', 'Amanhã, 12h', 'Amanhã, 18h', 'Em 3 dias'];
    let contador = 0;
    const gerarDoacao = (retirada) => {
      const empresa = escolher(empresas), categoria = escolher(Object.keys(produtos));
      const [nome, unidade, minimo, maximo] = escolher(produtos[categoria]), validade = escolher(validades);
      return {
        id: 'teste' + (++contador), donoEmail: empresa.email, donoNome: empresa.nome, bairro: empresa.bairro,
        nome, qtd: entre(minimo, maximo), unidade, validade, categoria, urgente: !retirada && validade.startsWith('Hoje'),
        agendadoPor: retirada ? escolher(ongs).email : null
      };
    };
    const doacoes = [...Array.from({ length: 4800 }, () => gerarDoacao(true)), ...Array.from({ length: 36 }, () => gerarDoacao(false))];

    try {
      salvar(CHAVES.usuarios, obterUsuarios().filter(u => !u.email.endsWith(DOMINIO_TESTE)).concat(usuarios));
      salvar(CHAVES.doacoes, obterDoacoes().filter(x => !x.id.startsWith('teste')).concat(doacoes));
    } catch { avisar('Não foi possível salvar: o armazenamento do navegador está cheio.'); return; }
    mostrarTela('inicio');
    avisar(`Dados de teste gerados: ${ongs.length} ONGs, ${empresas.length} estabelecimentos doadores e ${formatar(doacoes.length - 36)} doações realizadas (36 em aberto). Agora crie a sua própria conta para usar o site.`);
  });

  $('btnLimparDados').addEventListener('click', async () => {
    if (!await confirmar('Isso apaga todos os cadastros, doações e a sessão atual, restaurando o site ao padrão. Deseja continuar?')) return;
    Object.values(CHAVES).forEach(chave => localStorage.removeItem(chave));
    sessao = null; motivoNegado = 'ausente';
    categoriaAtiva = 'Todos';
    atualizarCabecalho();
    mostrarTela('inicio');
    abrirIntro();
  });

  // 12.2) SLIDES DO HERO (troca automática e infinita)
  const slides = todos('.slide'), areaPontos = $('slidesPontos');
  let slideAtual = 0;
  slides.forEach(() => areaPontos.appendChild(document.createElement('span')));
  function mostrarSlide(indice) {
    slideAtual = indice;
    slides.forEach((slide, i) => slide.classList.toggle('ativo', i === indice));
    Array.from(areaPontos.children).forEach((ponto, i) => ponto.classList.toggle('ativo', i === indice));
  }
  mostrarSlide(0);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(() => mostrarSlide((slideAtual + 1) % slides.length), 4000);
  }

  // 13) INICIALIZAÇÃO
  atualizarCabecalho();
  definirTipoCadastro('ong');
  mostrarTela('inicio');
  abrirIntro();
  restaurarSessao().then(atualizarCabecalho); // confere o token que já estava salvo
  setInterval(() => { // se o token expirar com um painel aberto, o acesso é negado
    const noPainel = !$('tela-ong').hidden || !$('tela-empresa').hidden;
    if (noPainel && !usuarioLogado()) { atualizarCabecalho(); negarAcesso(); }
  }, 15000);
});