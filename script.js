
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
  const mainNav       = document.getElementById('mainNav');
  const headerActions = document.querySelector('.header-actions');

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

});