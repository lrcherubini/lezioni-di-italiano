/* ==========================================================================
   main.js — ponto de entrada da home e da página de aula.

   Existe para separar "o que a página faz" de "quando a página começa".
   `app.js` exporta as peças e não se autoinicializa: `ripasso.js` importa
   `mountExercise` e `initChrome` de lá, e se esse import trouxesse junto um
   bootstrap, a página de revisão subiria dois bootstraps e duplicaria os
   listeners da toolbar.

   Uma linha aqui é o preço de `app.js` continuar importável.
   ========================================================================== */

import { boot } from './app.js';

document.addEventListener('DOMContentLoaded', boot);
