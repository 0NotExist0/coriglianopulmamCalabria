/**
 * ITALIARUN — SUGGERIMENTO DI SCORRIMENTO NAV DESKTOP
 * La barra di navigazione in alto può scorrere in orizzontale ma la scrollbar
 * è nascosta: senza indizi l'utente non capisce che "Accedi" (ultima voce) è
 * lì e va raggiunta scorrendo. Qui aggiungiamo: sfumature ai bordi, un pulsante
 * freccia che scorre, e una piccola animazione "nudge" una tantum.
 * Modulo autonomo: se il wrapper non c'è, non fa nulla.
 * Firmato 0Not_Exist0 — Not Exist Web Services
 */
(function () {
  "use strict";
  function init() {
    var wrap = document.querySelector(".desktop-nav-scroll");
    var nav = document.querySelector(".desktop-nav");
    if (!wrap || !nav || wrap._navHint) return;
    wrap._navHint = true;

    var cue = wrap.querySelector(".nav-scroll-cue");
    if (cue) {
      cue.addEventListener("click", function () {
        nav.scrollBy({ left: Math.max(160, Math.round(nav.clientWidth * 0.6)), behavior: "smooth" });
      });
    }

    function update() {
      if (!nav.offsetParent) { wrap.classList.remove("can-left", "can-right"); return; }
      var max = nav.scrollWidth - nav.clientWidth - 1;
      wrap.classList.toggle("can-left", nav.scrollLeft > 4);
      wrap.classList.toggle("can-right", max > 4 && nav.scrollLeft < max);
    }

    nav.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    // "Nudge" una tantum per sessione: mostra che la barra scorre.
    try {
      if (!sessionStorage.getItem("navCueNudged")) {
        setTimeout(function () {
          if (nav.offsetParent && nav.scrollWidth > nav.clientWidth + 8) {
            var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (!reduce && cue) {
              cue.classList.add("nudge");
              var x = nav.scrollLeft;
              nav.scrollTo({ left: x + 46, behavior: "smooth" });
              setTimeout(function () { nav.scrollTo({ left: x, behavior: "smooth" }); }, 650);
              setTimeout(function () { cue.classList.remove("nudge"); }, 3400);
            }
            sessionStorage.setItem("navCueNudged", "1");
          }
        }, 900);
      }
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  setTimeout(init, 1500);
})();
