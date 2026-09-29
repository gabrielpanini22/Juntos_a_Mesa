/* ==========================================================================
   JUNTOS À MESA — script.js
   Toda a interatividade do site: modal de introdução (onboarding),
   botão de ajuda "?", menu mobile e toggle ONG/Doador.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ------------------------------------------------------------------
     1) MODAL DE INTRODUÇÃO (ONBOARDING)
  ------------------------------------------------------------------ */
  const introOverlay = document.getElementById('introOverlay');
  const introSteps   = Array.from(document.querySelectorAll('#introOverlay .modal-step'));
  const introDots    = Array.from(document.querySelectorAll('#introProgress .dot'));
  const introBack    = document.getElementById('introBack');
  const introNext    = document.getElementById('introNext');
  const introClose   = document.getElementById('introClose');
  const helpButton   = document.getElementById('helpButton');

  const TOTAL_STEPS = introSteps.length;
  let currentStep = 1;
  let lastFocusedEl = null;

  function renderIntroStep() {
    introSteps.forEach(step => {
      step.classList.toggle('is-active', Number(step.dataset.step) === currentStep);
    });
    introDots.forEach(dot => {
      dot.classList.toggle('is-active', Number(dot.dataset.dot) === currentStep);
    });

    // "Voltar" some no primeiro passo
    introBack.hidden = currentStep === 1;

    // Último passo: botão vira "Começar agora"
    if (currentStep === TOTAL_STEPS) {
      introNext.textContent = 'Começar agora →';
      introNext.classList.remove('btn-primary');
      introNext.classList.add('btn-dark');
    } else {
      introNext.textContent = 'Próximo →';
      introNext.classList.remove('btn-dark');
      introNext.classList.add('btn-primary');
    }
  }

  function openIntro(triggerEl) {
    lastFocusedEl = triggerEl || document.activeElement;
    currentStep = 1;
    renderIntroStep();
    introOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    introClose.focus();
  }

  function closeIntro() {
    introOverlay.hidden = true;
    document.body.style.overflow = '';
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
  }

  introNext.addEventListener('click', () => {
    if (currentStep < TOTAL_STEPS) {
      currentStep += 1;
      renderIntroStep();
    } else {
      closeIntro();
    }
  });

  introBack.addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep -= 1;
      renderIntroStep();
    }
  });

  introClose.addEventListener('click', closeIntro);

  introOverlay.addEventListener('click', (event) => {
    if (event.target === introOverlay) closeIntro();
  });

  helpButton.addEventListener('click', () => openIntro(helpButton));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !introOverlay.hidden) closeIntro();
  });

  // Mostra a introdução automaticamente ao entrar no site
  openIntro(null);


  /* ------------------------------------------------------------------
     2) MENU MOBILE (HAMBURGER)
  ------------------------------------------------------------------ */
  const navToggle     = document.getElementById('navToggle');
  const mainNav        = document.getElementById('mainNav');
  const headerActions  = document.querySelector('.header-actions');

  function closeMobileMenu() {
    navToggle.setAttribute('aria-expanded', 'false');
    mainNav.classList.remove('is-open');
    headerActions.classList.remove('is-open');
  }

  navToggle.addEventListener('click', () => {
    const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isOpen));
    mainNav.classList.toggle('is-open', !isOpen);
    headerActions.classList.toggle('is-open', !isOpen);
  });

  // Fecha o menu mobile ao clicar em qualquer link de navegação
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });


  /* ------------------------------------------------------------------
     3) TOGGLE DE CADASTRO (Sou uma ONG / Sou um Doador)
  ------------------------------------------------------------------ */
  const cadastroToggle   = document.getElementById('cadastroToggle');
  const toggleButtons    = Array.from(cadastroToggle.querySelectorAll('.toggle-pill__btn'));
  const cadastroCardTitle = document.getElementById('cadastroCardTitle');
  const cadastroCardDesc  = document.getElementById('cadastroCardDesc');
  const cadastroCardBtn   = document.getElementById('cadastroCardBtn');

  const AUDIENCE_CONTENT = {
    ong: {
      title: 'Cadastro para ONGs',
      desc: 'Acesse o formulário completo de cadastro para ONGs.',
      btnLabel: 'Criar conta ONG →',
      btnClass: 'btn-dark'
    },
    doador: {
      title: 'Cadastro para Doadores',
      desc: 'Acesse o formulário completo de cadastro para estabelecimentos doadores.',
      btnLabel: 'Criar conta Doador →',
      btnClass: 'btn-primary'
    }
  };

  function setAudience(audience) {
    toggleButtons.forEach(btn => {
      const isActive = btn.dataset.audience === audience;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    const content = AUDIENCE_CONTENT[audience];
    cadastroCardTitle.textContent = content.title;
    cadastroCardDesc.textContent = content.desc;
    cadastroCardBtn.textContent = content.btnLabel;
    cadastroCardBtn.classList.remove('btn-dark', 'btn-primary');
    cadastroCardBtn.classList.add(content.btnClass);
  }

  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => setAudience(btn.dataset.audience));
  });

  function scrollToCadastro(audience) {
    if (audience) setAudience(audience);
    document.getElementById('cadastro').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Botões do hero: "Sou uma ONG" / "Sou um Doador"
  document.querySelectorAll('[data-toggle-target]').forEach(btn => {
    btn.addEventListener('click', () => scrollToCadastro(btn.dataset.toggleTarget));
  });

  // Links do rodapé: "Cadastrar ONG" / "Cadastrar Doador"
  document.querySelectorAll('[data-audience-link]').forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      scrollToCadastro(link.dataset.audienceLink);
    });
  });

  // Botão "Cadastrar-se" do header
  document.getElementById('btnCadastrar').addEventListener('click', () => scrollToCadastro());

  // Caixas de estado vazio: "Quero doar" (Doações) e "Quero ser parceiro" (Parceiros)
  document.getElementById('btnPrimeiraDoacao').addEventListener('click', () => scrollToCadastro('doador'));
  document.getElementById('btnSerParceiro').addEventListener('click', () => scrollToCadastro('ong'));


  /* ------------------------------------------------------------------
     4) BUSCA NO MAPA (demonstração)
  ------------------------------------------------------------------ */
  const mapSearchForm = document.getElementById('mapSearchForm');
  mapSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = mapSearchForm.querySelector('input');
    if (input.value.trim()) {
      input.placeholder = `Resultados de demonstração para "${input.value.trim()}"`;
      input.value = '';
    }
  });

});