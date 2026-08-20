/* app.js — PortfolioBuilder interactivity */

// ─── State ────────────────────────────────────────────────
let resumeFile       = null;          // the actual File object
let selectedTemplate = 'template1.html';

// ─── Hamburger / Mobile Menu ──────────────────────────────
const hamburger  = document.getElementById('hamburger-btn');
const mobileMenu = document.getElementById('mobile-menu');
const siteHeader = document.getElementById('top');

hamburger?.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  hamburger.classList.toggle('open', isOpen);
  hamburger.setAttribute('aria-expanded', isOpen);
  mobileMenu.setAttribute('aria-hidden', !isOpen);
  siteHeader?.classList.toggle('menu-open', isOpen);
});
mobileMenu?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    hamburger?.classList.remove('open');
    hamburger?.setAttribute('aria-expanded', 'false');
    mobileMenu.setAttribute('aria-hidden', 'true');
    siteHeader?.classList.remove('menu-open');
  });
});

// ─── Tips Accordion ───────────────────────────────────────
const tipToggles = document.querySelectorAll('.tip-toggle');

tipToggles.forEach(toggle => {
  toggle.addEventListener('click', () => {
    const item = toggle.closest('.tip-item');
    const isOpen = item.classList.contains('open');

    // Keep the section compact: only one tip is open at a time.
    document.querySelectorAll('.tip-item.open').forEach(openItem => {
      openItem.classList.remove('open');
      openItem.querySelector('.tip-toggle')?.setAttribute('aria-expanded', 'false');
    });

    if (!isOpen) {
      item.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
    }
  });
});

// ─── File Upload Logic ────────────────────────────────────
const uploadCard      = document.getElementById('upload-card');
const uploadZone      = document.getElementById('upload-zone');
const fileInput       = document.getElementById('resume-file-input');
const chooseBtn       = document.getElementById('choose-file-btn');
const removeBtn       = document.getElementById('remove-file-btn');
const postUploadPanel = document.getElementById('post-upload-panel');
const pupFilename     = document.getElementById('pup-filename');
const generateMainBtn = document.getElementById('btn-generate-main');

chooseBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput?.click();
});

uploadZone?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); }
});

fileInput?.addEventListener('change', () => {
  if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const extOk = /\.(pdf|docx|txt)$/i.test(file.name);
  if (!extOk) { showNotification('❌ Please upload a PDF, DOCX, or TXT file.', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { showNotification('❌ File exceeds 10MB limit.', 'error'); return; }

  resumeFile = file;

  // Hide the upload dropzone — the post-upload panel takes its place.
  uploadCard.setAttribute('hidden', '');
  uploadZone.classList.remove('dragging');

  // Show the post-upload panel
  pupFilename.textContent = file.name;
  postUploadPanel.removeAttribute('hidden');

  showNotification('✅ Resume uploaded! Choose a template and generate your portfolio.', 'success');
}

removeBtn?.addEventListener('click', resetUpload);

function resetUpload() {
  fileInput.value = '';
  postUploadPanel.setAttribute('hidden', '');
  uploadCard.removeAttribute('hidden');
  resumeFile = null;
}

// ─── Drag & Drop ──────────────────────────────────────────
const dropTarget = document.getElementById('upload-card');
['dragenter', 'dragover'].forEach(evt =>
  dropTarget?.addEventListener(evt, (e) => { e.preventDefault(); uploadZone?.classList.add('dragging'); })
);
['dragleave', 'dragend', 'drop'].forEach(evt =>
  dropTarget?.addEventListener(evt, () => uploadZone?.classList.remove('dragging'))
);
dropTarget?.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

// ─── Template Chip Selection (inside post-upload panel) ───
document.querySelectorAll('.pup-chip:not(.pup-chip-disabled)').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.pup-chip').forEach(c => c.classList.remove('pup-chip-active'));
    chip.classList.add('pup-chip-active');
    selectedTemplate = chip.dataset.template || 'template1.html';
  });
});

// ─── Template Card Selection (templates section) ──────────
document.querySelectorAll('.template-card:not(.coming-soon-card)').forEach(card => {
  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-preview-tmpl')) return;
    document.querySelectorAll('.template-card').forEach(c => {
      c.classList.remove('active-template');
      c.setAttribute('aria-pressed', 'false');
    });
    card.classList.add('active-template');
    card.setAttribute('aria-pressed', 'true');
    selectedTemplate = card.dataset.template || 'template1.html';

    // Sync the chip in the panel
    document.querySelectorAll('.pup-chip').forEach(c => c.classList.remove('pup-chip-active'));
    const matchingChip = document.querySelector(`.pup-chip[data-template="${selectedTemplate}"]`);
    matchingChip?.classList.add('pup-chip-active');

    showNotification('✅ Template selected!', 'success');
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
  });
});

// ─── Generate Portfolio — Main Action ────────────────────
generateMainBtn?.addEventListener('click', async () => {
  if (!resumeFile) {
    showNotification('❌ Please upload a resume first.', 'error');
    return;
  }

  // Show loading state
  setGeneratingState(true);

  try {
    // STEP 1: Read file text
    const resumeText = await readFileAsText(resumeFile);

    // STEP 2: Extract structured JSON via backend or client-side
    const portfolioData = await extractPortfolioData(resumeText);

    // STEP 3: Store in localStorage so template can read it
    localStorage.setItem('portfolioData', JSON.stringify(portfolioData));
    localStorage.setItem('portfolioTemplate', selectedTemplate);

    // STEP 4: Navigate to template
    showNotification('🎉 Portfolio generated! Opening...', 'success');
    setTimeout(() => { window.location.href = selectedTemplate; }, 800);

  } catch (err) {
    console.error('Portfolio generation error:', err);
    showNotification('❌ Generation failed. Using template with sample data.', 'error');
    // Clear any portfolioData left over from a PREVIOUS successful generation —
    // otherwise the template would silently show that old resume's data here
    // while this message claims it's showing sample/default data.
    localStorage.removeItem('portfolioData');
    localStorage.removeItem('portfolioTemplate');
    // Fallback: open template anyway with sample data
    setTimeout(() => { window.location.href = selectedTemplate; }, 1200);
  } finally {
    setGeneratingState(false);
  }
});

function setGeneratingState(isLoading) {
  if (!generateMainBtn) return;
  if (isLoading) {
    generateMainBtn.classList.add('loading');
    generateMainBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="spin" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.3)" stroke-width="2.5"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      Generating…`;
  } else {
    generateMainBtn.classList.remove('loading');
    generateMainBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M13 2L4.09 12.26 12 12l-1 10L21 11.74 13 12l1-10z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
      Generate My Portfolio
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }
}

// ─── Read File as Text ────────────────────────────────────
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt') {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);

    } else if (ext === 'pdf') {
      // For PDF: send to backend, or use raw text extraction
      // We'll try backend first, fallback to raw
      sendToBackend(file).then(resolve).catch(() => {
        // Fallback: read as text (won't work well for binary PDF)
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

    } else if (ext === 'docx') {
      sendToBackend(file).then(resolve).catch(() => resolve(''));

    } else {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    }
  });
}

// ─── Send to Python Backend ───────────────────────────────
async function sendToBackend(file) {
  const formData = new FormData();
  formData.append('resume', file);

  const res = await fetch('/api/parse-resume', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  const data = await res.json();
  return data.text || '';
}

// ─── Extract Portfolio Data from Resume Text ──────────────
async function extractPortfolioData(resumeText) {
  // Try backend AI extraction first
  try {
    const res = await fetch('/api/extract-portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: resumeText })
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    console.warn('Backend extraction unavailable, using client-side parsing.');
  }

  // Fallback: basic client-side text parsing
  return parseResumeClientSide(resumeText);
}

// ─── Client-side Resume Parser (fallback) ─────────────────
function parseResumeClientSide(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Heuristic extraction
  const emailMatch    = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
  const phoneMatch    = text.match(/(\+?\d[\d\s\-().]{8,15}\d)/);
  const linkedInMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  const githubMatch   = text.match(/github\.com\/[\w-]+/i);

  // Try to find name (first non-empty line, or line before email)
  const name = lines[0] || 'Your Name';

  // Skills detection: look for lines with comma-separated short items
  const skillKeywords = ['javascript','python','react','node','java','c++','html','css','sql',
    'typescript','vue','angular','django','flask','aws','docker','git','linux','figma','mongodb'];
  const foundSkills = [];
  text.toLowerCase().split(/[\n,|•·]/g).forEach(chunk => {
    const trimmed = chunk.trim();
    if (trimmed.length < 40) {
      skillKeywords.forEach(kw => {
        if (trimmed.includes(kw) && !foundSkills.includes(kw)) foundSkills.push(kw);
      });
    }
  });

  return {
    name:       name,
    title:      detectTitle(text) || 'Software Engineer',
    bio:        detectBio(lines),
    email:      emailMatch   ? emailMatch[0]   : 'your@email.com',
    phone:      phoneMatch   ? phoneMatch[0]   : '+91 00000 00000',
    location:   detectLocation(text),
    linkedin:   linkedInMatch ? 'https://' + linkedInMatch[0] : '#',
    github:     githubMatch   ? 'https://' + githubMatch[0]   : '#',
    skills:     foundSkills.length ? foundSkills.map(s => capitalize(s)) : ['Skill 1','Skill 2','Skill 3','Skill 4'],
    education:  detectEducation(text),
    experience: detectExperience(text),
    projects:   detectProjects(text),
    achievements: detectAchievements(text),
  };
}

function detectTitle(text) {
  const titles = ['software engineer','frontend developer','backend developer','full stack',
    'data scientist','ml engineer','devops','product manager','ui/ux designer','web developer',
    'mobile developer','android developer','ios developer','cloud engineer'];
  const lower = text.toLowerCase();
  return titles.find(t => lower.includes(t)) ? capitalize(titles.find(t => lower.includes(t))) : null;
}

function detectBio(lines) {
  // Objective / Summary section
  const idx = lines.findIndex(l => /objective|summary|profile|about/i.test(l));
  if (idx !== -1 && lines[idx+1]) return lines.slice(idx+1, idx+3).join(' ');
  return 'A passionate professional with a drive for excellence and innovation.';
}

function detectLocation(text) {
  const match = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*(?:[A-Z]{2}|[A-Za-z]+))/);
  return match ? match[0] : 'Your Location';
}

function detectEducation(text) {
  const degreePattern = /(B\.?Tech|M\.?Tech|B\.?Sc|M\.?Sc|BE|ME|BCA|MCA|MBA|B\.?E|B\.?Com|Bachelor|Master|PhD|Diploma)[^\n]*/gi;
  const matches = [...text.matchAll(degreePattern)];
  if (matches.length === 0) return [{ degree: 'Degree / Course Name', school: 'Institution Name', year: 'Year – Year' }];
  return matches.slice(0,3).map(m => ({
    degree: m[0].trim().substring(0, 60),
    school: 'Institution',
    year: detectYear(m[0]) || 'Year – Year'
  }));
}

function detectExperience(text) {
  const expSection = text.match(/(?:experience|work history|employment)([\s\S]{0,2000}?)(?:education|skills|projects|$)/i);
  if (!expSection) return [{ role: 'Job Title', company: 'Company Name', duration: 'Year – Year', bullets: ['Key responsibility.'] }];
  const lines = expSection[1].split('\n').map(l => l.trim()).filter(Boolean);
  // Very basic: take first few lines as job title / company
  const bullets = lines.slice(2, 5).filter(l => l.length > 10).map(l => l.replace(/^[•\-*]\s*/, ''));
  return [{
    role: lines[0] || 'Job Title',
    company: lines[1] || 'Company Name',
    duration: detectYear(expSection[1]) || 'Year – Year',
    bullets: bullets.length ? bullets : ['Key responsibility.']
  }];
}

function detectProjects(text) {
  const projSection = text.match(/projects?([\s\S]{0,2000}?)(?:experience|education|skills|achievements|$)/i);
  if (!projSection) return [{ name: 'Project Title', tech: 'Tech Stack', github: '#', demo: '#' }];
  const lines = projSection[1].split('\n').map(l => l.trim()).filter(l => l.length > 3);
  const projects = [];
  const limit = Math.min(lines.length, 6);
  let i = 0;
  while (i < limit && projects.length < 3) {
    if (lines[i].length > 3 && lines[i].length < 60) {
      const tech = lines[i + 1] || 'Tech Stack';
      projects.push({ name: lines[i], tech, github: '#', demo: '#' });
      i += 2; // skip the line we just used as "tech" so it isn't reused as the next project's name
    } else {
      i += 1;
    }
  }
  return projects.length ? projects : [{ name: 'Project Title', tech: 'Tech Stack', github: '#', demo: '#' }];
}

function detectAchievements(text) {
  const achSection = text.match(/(?:achievements?|certifications?|awards?|honors?)([\s\S]{0,1500}?)(?:experience|education|projects|$)/i);
  if (!achSection) return [];
  return achSection[1].split('\n')
    .map(l => l.trim().replace(/^[•\-*]\s*/, ''))
    .filter(l => l.length > 5 && l.length < 100)
    .slice(0,5)
    .map(title => ({ title, sub: '' }));
}

function detectYear(text) {
  const m = text.match(/\d{4}\s*[-–]\s*(?:\d{4}|Present|Current)/i);
  return m ? m[0] : null;
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── Toast Notification ───────────────────────────────────
function showNotification(message, type = 'info') {
  const existing = document.getElementById('toast-notification');
  existing?.remove();
  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.setAttribute('role', 'alert');
  toast.style.cssText = `
    position:fixed;bottom:28px;left:50%;
    transform:translateX(-50%) translateY(20px);
    background:${type === 'error' ? '#fef2f2' : '#f0fdf4'};
    color:${type === 'error' ? '#b91c1c' : '#15803d'};
    border:1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'};
    border-radius:12px;padding:12px 24px;font-size:.92rem;font-weight:600;
    box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:9999;opacity:0;
    transition:opacity .3s ease,transform .3s ease;
    font-family:'Inter',sans-serif;white-space:nowrap;max-width:90vw;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }));
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

// ─── Spin animation for loading ───────────────────────────
const spinStyle = document.createElement('style');
spinStyle.textContent = `@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin .8s linear infinite}`;
document.head.appendChild(spinStyle);

// ─── Scroll Reveal ────────────────────────────────────────
const revealEls = document.querySelectorAll('.feature-item,.template-card,.stat-card,.about-text,.about-stats,.generate-cta,.step-item,.tip-item,.faq-item');
revealEls.forEach(el => el.classList.add('reveal'));
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });
revealEls.forEach(el => observer.observe(el));

// ─── Active nav highlight on scroll ──────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinks  = document.querySelectorAll('.nav-link');
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('nav-active'));
      document.querySelector(`.nav-link[href="#${entry.target.id}"]`)?.classList.add('nav-active');
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });
sections.forEach(s => navObserver.observe(s));

// ─── Marquee: duplicate track for seamless loop ─────────────
const marqueeTrack = document.getElementById('marquee-track');
if (marqueeTrack) {
  marqueeTrack.innerHTML += marqueeTrack.innerHTML;
}

// ─── Header: shadow on scroll ───────────────────────────────
const pageHeader = document.querySelector('.header');
if (pageHeader) {
  const onScroll = () => pageHeader.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ─── Hero showcase: gentle mouse parallax (desktop only) ────
const showcaseStage = document.getElementById('showcase-stage');
const showcaseCard = document.getElementById('showcase-card');
if (showcaseStage && showcaseCard && window.matchMedia('(min-width: 1000px)').matches) {
  const hero = document.getElementById('hero');
  hero?.addEventListener('mousemove', (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    showcaseCard.style.transition = 'transform .12s linear';
    showcaseCard.style.transform = `rotate(${2.5 - x * 4}deg) translateY(${y * -12}px)`;
  });
  hero?.addEventListener('mouseleave', () => {
    showcaseCard.style.transition = '';
    showcaseCard.style.transform = 'rotate(2.5deg)';
  });
}


// fifth