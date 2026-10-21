
/* Navigation presentation adapter; delegates to the existing canonical handlers. */
(()=>{
 const trigger=document.getElementById('readerNavToggle');
 const menu=document.getElementById('readerQuickNav');
 if(!trigger||!menu)return;
 let returnFocus=null;
 const close=(restore=false)=>{if(menu.hidden)return;menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();};
 trigger.addEventListener('click',()=>{const willOpen=menu.hidden;menu.hidden=!willOpen;trigger.setAttribute('aria-expanded',String(willOpen));if(willOpen){returnFocus=document.activeElement;menu.querySelector('button')?.focus()}});
 menu.querySelectorAll('[data-quick-target]').forEach(btn=>btn.addEventListener('click',()=>{
  const dest=document.getElementById(btn.dataset.quickTarget);close();dest?.click();
 }));
 menu.querySelector('#quickScenesMobile')?.addEventListener('click',()=>close());
 document.addEventListener('click',ev=>{if(!menu.hidden&&!menu.contains(ev.target)&&ev.target!==trigger)close()});
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!menu.hidden){ev.preventDefault();ev.stopImmediatePropagation();close(true)}},true);
 window.addEventListener('popstate',()=>close());
 window.addEventListener('hashchange',()=>close());
})();
