/* =========================================================
   TANDOOR & GRILLE — motion system
   Rebuilt to mirror larevoltosa.es:
   Lenis + GSAP (ScrollTrigger, SplitText, Observer, ScrollTo)
   Signature: masked line/word reveals (power4.out, yPercent100),
   scatter→assemble grids, scroll-velocity marquees, scrubbed hero.
   ========================================================= */
(function(){
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const hasGSAP = typeof gsap !== 'undefined';
  if (hasGSAP){
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin,
      (typeof Observer!=='undefined'?Observer:null),
      (typeof SplitText!=='undefined'?SplitText:null));
    gsap.defaults({ ease:'power4.out' });   // La Revoltosa's dominant ease
  }
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =======================================================
     LENIS SMOOTH SCROLL (drives ScrollTrigger)
     ======================================================= */
  let lenis = null;
  if (typeof Lenis !== 'undefined' && !prefersReduced){
    try{
      lenis = new Lenis({ lerp:.085, wheelMultiplier:1, smoothWheel:true });
      lenis.on('scroll', ()=> hasGSAP && ScrollTrigger.update());
      gsap.ticker.add((t)=> lenis.raf(t*1000));
      gsap.ticker.lagSmoothing(0);
    }catch(e){ lenis = null; }
  }
  function scrollToId(id){
    if(lenis) lenis.scrollTo(id, {offset:0, duration:1.3, easing:(t)=>1-Math.pow(1-t,4)});
    else { const el=document.querySelector(id); if(el) el.scrollIntoView({behavior:'smooth'}); }
  }
  function getScroll(){ return lenis ? lenis.animatedScroll : window.scrollY; }
  function getVelocity(){ return lenis ? (lenis.velocity||0) : 0; }

  /* =======================================================
     SPLIT-TEXT MASKED REVEALS  (the core signature)
     Every heading & paragraph rises line-by-line from a mask.
     ======================================================= */
  const splits = [];
  function revealLines(el, opts={}){
    if(!hasGSAP || typeof SplitText==='undefined'){ el.style.opacity=1; return; }
    const split = new SplitText(el, {
      type: opts.type || 'lines',
      mask: opts.mask || 'lines',
      linesClass:'l-line', wordsClass:'l-word', charsClass:'l-char',
      autoSplit:true
    });
    splits.push(split);
    const units = opts.type==='chars' ? split.chars
                : opts.type==='words' ? split.words
                : split.lines;
    gsap.set(units, { yPercent:110 });
    gsap.set(el, { opacity:1 });
    ScrollTrigger.create({
      trigger: el, start: opts.start || 'top 88%', once:true,
      onEnter:()=> gsap.to(units, {
        yPercent:0, duration:opts.duration||1.05,
        ease:'power4.out', stagger:opts.stagger!=null?opts.stagger:.09,
        delay:opts.delay||0
      })
    });
  }

  /* =======================================================
     SCATTER → ASSEMBLE  (grids: random rotation, settle)
     Mirrors initScatterAnimation() on the reference.
     ======================================================= */
  function scatterIn(items, trigger, opts={}){
    if(!hasGSAP){ return; }
    items.forEach((el)=> gsap.set(el, {
      opacity:0, yPercent:14,
      rotation: gsap.utils.random(-9,9),
      transformOrigin:'50% 100%'
    }));
    ScrollTrigger.create({
      trigger: trigger || items[0], start: opts.start||'top 82%', once:true,
      onEnter:()=> gsap.to(items, {
        opacity:1, yPercent:0, rotation:0,
        duration:1.15, ease:'power4.out',
        stagger:{ each:opts.each!=null?opts.each:.09, from:opts.from||'start' }
      })
    });
  }

  /* =======================================================
     CHAR REVEAL for the big "exploded" section titles
     Letters rise from a mask with a touch of scatter.
     ======================================================= */
  function explodedTitle(h){
    const spans = [...h.querySelectorAll('span')];
    if(!hasGSAP){ return; }
    spans.forEach(s=>{ s.style.display='inline-block'; s.style.willChange='transform'; });
    gsap.set(spans, { yPercent:120, rotation:()=>gsap.utils.random(-12,12), opacity:0 });
    ScrollTrigger.create({
      trigger:h, start:'top 84%', once:true,
      onEnter:()=> gsap.to(spans, {
        yPercent:0, rotation:0, opacity:1,
        duration:1.1, ease:'power4.out', stagger:.045
      })
    });
  }

  /* =======================================================
     MARQUEE — infinite loop coupled to scroll velocity
     Mirrors animMarquee()+scrollMarquee(): ease none loop,
     scroll speeds it up and flips direction.
     ======================================================= */
  const marquees = [];
  function buildMarquee(marqueeEl){
    const track = marqueeEl.querySelector('.marquee__track');
    if(!track || !hasGSAP) return;
    track.innerHTML += track.innerHTML;   // duplicate once for seamless wrap
    const rec = { track, baseDir: track.classList.contains('marquee__track--rev') ? 1 : -1, tl:null };
    loopMarquee(rec);
    marquees.push(rec);
  }
  function loopMarquee(rec){
    if(rec.tl) rec.tl.kill();
    const total = rec.track.scrollWidth / 2;
    const d = rec.baseDir;
    gsap.set(rec.track, { x: d>0 ? -total : 0 });
    rec.tl = gsap.to(rec.track, {
      x: d<0 ? -total : 0, duration:26, ease:'none', repeat:-1,
      modifiers:{ x: gsap.utils.unitize(x=> (parseFloat(x)%total) + (d<0?0:-total)) }
    });
  }
  // scroll velocity → marquee speed & direction (mirrors scrollMarquee)
  let velSmooth = 0;
  function marqueeTick(){
    velSmooth += (getVelocity() - velSmooth) * 0.08;
    const ts = gsap.utils.clamp(-8, 8, 1 + velSmooth * 0.05);
    marquees.forEach(m=> m.tl && m.tl.timeScale(ts));
  }
  function remeasureMarquees(){ marquees.forEach(loopMarquee); }

  /* =======================================================
     HERO — scrubbed media, embers, video
     ======================================================= */
  function heroMotion(){
    const media = document.querySelector('.hero__media');
    const vid = document.getElementById('heroVid');
    const img = document.getElementById('heroImg');
    // hide hero content until the splash lifts (words masked)
    const heroWords = document.querySelectorAll('.hero__title .line > span, .hero__title .line > em');
    const heroBits = document.querySelectorAll('.hero__eyebrow, .hero__lede, .hero__cta, .hero__scroll');
    if(hasGSAP){ gsap.set(heroWords,{yPercent:112}); gsap.set(heroBits,{opacity:0, y:26}); }
    window.__heroReveal = function(){
      if(!hasGSAP){ return; }
      gsap.to(heroWords,{ yPercent:0, duration:1.25, ease:'power4.out', stagger:.11 });
      gsap.to(heroBits,{ opacity:1, y:0, duration:1, ease:'power4.out', stagger:.09, delay:.25 });
    };
    if(vid){
      vid.play && vid.play().catch(()=>{});
      // fade image out once video can play (video sits under image)
      vid.addEventListener('loadeddata', ()=>{
        if(vid.videoWidth>0) gsap.to(img,{opacity:0,duration:.8,delay:.2});
      });
    }
    if(hasGSAP && !prefersReduced){
      gsap.to(media.querySelectorAll('#heroImg,#heroVid'), {
        yPercent:16, scale:1.06, ease:'none',
        scrollTrigger:{ trigger:'.hero', start:'top top', end:'bottom top', scrub:true }
      });
    }
    // embers
    const box = document.getElementById('embers');
    if(box && !prefersReduced){
      for(let i=0;i<30;i++){
        const e=document.createElement('span'); e.className='ember';
        e.style.left=Math.random()*100+'%';
        e.style.width=e.style.height=(2+Math.random()*4)+'px';
        box.appendChild(e);
        gsap.to(e,{ y:-(innerHeight*(.6+Math.random()*.5)), x:(Math.random()*90-45),
          duration:3+Math.random()*3.5, ease:'power1.out', repeat:-1, delay:Math.random()*6,
          keyframes:{ opacity:[0,.9,0] } });
      }
    }
  }

  /* =======================================================
     SPLASH — spinner + count, then Flip-style lift
     ======================================================= */
  function splash(done){
    const el = document.getElementById('splash');
    if(!el){ done(); return; }
    const letters = el.querySelectorAll('.splash__word span');
    const sub = el.querySelector('.splash__sub');
    const pct = document.getElementById('splashPct');
    const spinner = el.querySelector('.splash__spinner svg');
    if(!hasGSAP){ el.style.display='none'; document.body.classList.add('loaded'); done(); return; }

    if(spinner) gsap.to(spinner,{rotation:360,duration:1,ease:'none',repeat:-1,transformOrigin:'50% 50%'});
    const counter={v:0};
    const tl = gsap.timeline({ onComplete:()=>{ el.style.display='none'; done(); } });
    tl.to(letters,{ yPercent:0, opacity:1, duration:.8, stagger:.05, delay:.15 })
      .to(sub,{ opacity:.9, duration:.6 }, '-=.35')
      .to(counter,{ v:100, duration:1.15, ease:'power1.inOut',
          onUpdate:()=>{ if(pct) pct.textContent=Math.round(counter.v); } }, '-=.8')
      .addLabel('lift','-=.15')
      .to([letters, sub, el.querySelector('.splash__spinner'), el.querySelector('.splash__count')],
          { yPercent:-40, opacity:0, duration:.6, ease:'power2.in' }, 'lift')
      .to(el,{ yPercent:-100, duration:1, ease:'power4.inOut' }, 'lift+=.15')
      .add(()=>{ document.body.classList.add('loaded'); window.__heroReveal && window.__heroReveal(); }, 'lift+=.2');
  }

  /* =======================================================
     NAV / MENU / LANG  (unchanged behaviour, hardened)
     ======================================================= */
  function chrome(){
    const nav = document.getElementById('nav');
    const onScroll = ()=> nav && nav.classList.toggle('scrolled', getScroll()>40);
    if(lenis) lenis.on('scroll', onScroll);
    window.addEventListener('scroll', onScroll, {passive:true});

    document.querySelectorAll('a[href^="#"]').forEach(a=>{
      a.addEventListener('click', e=>{
        const id=a.getAttribute('href');
        if(id.length>1){ e.preventDefault(); scrollToId(id);
          document.getElementById('navLinks').classList.remove('open');
          document.getElementById('burger').classList.remove('active');
        }
      });
    });
    const burger=document.getElementById('burger');
    burger && burger.addEventListener('click',()=>{
      document.getElementById('navLinks').classList.toggle('open');
      burger.classList.toggle('active');
    });
    const html=document.documentElement, lb=document.getElementById('langToggle');
    function applyLang(l){
      html.setAttribute('data-lang',l); html.setAttribute('lang',l);
      document.querySelectorAll('[data-en]').forEach(n=>{
        const v=n.getAttribute('data-'+l); if(v!=null) n.textContent=v;
      });
      ScrollTrigger.refresh();
    }
    lb && lb.addEventListener('click',()=>applyLang(html.getAttribute('data-lang')==='en'?'fr':'en'));
  }

  /* =======================================================
     WIRE EVERYTHING UP
     ======================================================= */
  function build(){
    chrome();
    heroMotion();

    // marquees
    document.querySelectorAll('.marquee').forEach(buildMarquee);
    if(marquees.length && hasGSAP) gsap.ticker.add(marqueeTick);

    // masked line reveals — headings + copy
    document.querySelectorAll('.kitchen__head, .story__head, .cater h2')
      .forEach(el=> revealLines(el, {type:'lines', stagger:.12, duration:1.15}));
    document.querySelectorAll('.kitchen__note, .sig__sub, .story__body p, .cater p, .quote p')
      .forEach(el=> revealLines(el, {type:'lines', stagger:.08}));
    document.querySelectorAll('.tag, .visit__col h4, .big-link, .hours, cite')
      .forEach(el=> revealLines(el, {type:'lines', stagger:.05, duration:.9}));

    // exploded section titles — char scatter reveal
    document.querySelectorAll('.exploded').forEach(explodedTitle);

    // scatter grids
    const strip=[...document.querySelectorAll('.strip__item')];
    if(strip.length) scatterIn(strip, document.querySelector('.strip'), {each:.1});
    const dishes=[...document.querySelectorAll('.dish')];
    if(dishes.length) scatterIn(dishes, document.querySelector('.dishes'), {each:.08});
    const stats=[...document.querySelectorAll('.story__stats > div')];
    if(stats.length) scatterIn(stats, document.querySelector('.story__stats'), {each:.1});
    const pays=[...document.querySelectorAll('.visit__col--cta, .pay')];

    // story image parallax
    const storyImg=document.querySelector('.story__media img');
    if(storyImg && hasGSAP && !prefersReduced){
      gsap.fromTo(storyImg,{yPercent:-8},{yPercent:8,ease:'none',
        scrollTrigger:{trigger:'.story',start:'top bottom',end:'bottom top',scrub:true}});
    }
    // mascot decorations: pop-in, gentle float, scroll parallax
    document.querySelectorAll('[data-deco]').forEach(el=>{
      if(!hasGSAP) return;
      const sp = parseFloat(el.dataset.speed||'1');
      const host = el.closest('section') || el.parentElement || el;
      if(!prefersReduced){
        gsap.fromTo(el,{scale:.2,opacity:0},{scale:1,opacity:gsap.getProperty(el,'opacity')||.9,
          duration:1.1, ease:'back.out(1.5)',
          scrollTrigger:{trigger:host, start:'top 80%', once:true}});
        gsap.to(el,{ yPercent: sp*-22, ease:'none',
          scrollTrigger:{trigger:host, start:'top bottom', end:'bottom top', scrub:true}});
      }
    });
    document.querySelectorAll('[data-float]').forEach(el=>{
      if(hasGSAP && !prefersReduced)
        gsap.to(el,{ y:'+=16', rotation:'+=7', duration:3.2, ease:'sine.inOut', repeat:-1, yoyo:true });
    });

    // strip image hover zoom handled in CSS; add scrub drift on tall items
    document.querySelectorAll('.strip__item--tall img').forEach(img=>{
      if(hasGSAP && !prefersReduced) gsap.fromTo(img,{yPercent:-4},{yPercent:6,ease:'none',
        scrollTrigger:{trigger:img,start:'top bottom',end:'bottom top',scrub:true}});
    });

    ScrollTrigger.refresh();
  }

  // start: splash first paint, build after fonts ready so SplitText measures right
  function boot(){
    const go = ()=> splash(()=> ScrollTrigger && ScrollTrigger.refresh());
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(()=>{ build(); go(); });
    } else { build(); go(); }
  }
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  window.addEventListener('load', ()=>{ if(hasGSAP){ remeasureMarquees(); ScrollTrigger.refresh(); } });
})();
