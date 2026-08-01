/* ==========================================================================
   record.js — gravar a própria voz na etapa de Produzione.

   ÚNICO lugar que toca em getUserMedia e MediaRecorder, pela mesma regra que
   faz speech.js ser o único a tocar em speechSynthesis: API de navegador com
   permissão, estado assíncrono e degradação real merece um lugar só.

   O que isto NÃO é, e não vai virar: reconhecimento de fala ou avaliação de
   pronúncia. É não-objetivo declarado do projeto. O aluno grava, ouve a si
   mesmo ao lado do modelo em italiano, e julga sozinho. Comparar a própria
   voz com o modelo é o exercício; uma nota automática de pronúncia seria
   ruído com aparência de precisão.

   A gravação é EFÊMERA, e isso é decisão, não limitação:

     · localStorage é string-only, e áudio em base64 estoura os ~5 MB dele
       em poucas gravações — arriscaria corromper o progresso, que mora lá;
     · IndexedDB resolveria, mas guardar a voz do aluno por padrão é um
       compromisso de privacidade que ninguém pediu.

   O blob morre ao sair da página, e a UI diz isso antes de gravar. Persistir
   para comparar evolução ao longo das semanas é trabalho futuro consciente.

   Nada sai do navegador. Não há upload, não há rede.
   ========================================================================== */

import { el } from './render.js';

/** MIME que a maioria dos navegadores aceita. `undefined` deixa o próprio
 *  MediaRecorder escolher — o Safari só grava em mp4. */
function melhorMime() {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of ['audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export function supported() {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined';
}

/**
 * Bloco de gravação para um item de produção.
 *
 * @param {object} opts
 * @param {Function} opts.onModel  toca o modelo em italiano (opcional)
 * @returns {HTMLElement}
 */
export function recorder({ onModel = null, label = 'Gravar' } = {}) {
  const box = el('div', { class: 'rec' });

  /* Sem API: a etapa continua inteira e utilizável. Mesma regra do modo
     degradado de áudio — nunca um botão morto sem explicação. */
  if (!supported()) {
    box.append(el('p', { class: 'item__nota' },
      'Este navegador não grava áudio. A tarefa continua valendo: '
      + 'diga em voz alta e compare com o modelo.'));
    if (onModel) box.append(botaoModelo(onModel));
    return box;
  }

  const gravar = el('button', { class: 'btn btn--sm', type: 'button' }, '⏺ ' + label);
  const parar = el('button', { class: 'btn btn--sm', type: 'button', hidden: true }, '⏹ Parar');
  const audio = el('audio', { class: 'rec__player', controls: true, hidden: true });
  const estado = el('span', { class: 'rec__stato', role: 'status', 'aria-live': 'polite' });

  const linha = el('div', { class: 'ex__row' }, gravar, parar);
  if (onModel) linha.append(botaoModelo(onModel));
  linha.append(estado);

  let rec = null;
  let stream = null;
  let url = null;

  const soltar = () => {
    // Sem isto o indicador de microfone do sistema fica aceso depois de
    // parar, o que assusta com razão.
    stream?.getTracks?.().forEach((t) => t.stop());
    stream = null;
  };

  gravar.addEventListener('click', async () => {
    estado.textContent = 'pedindo acesso ao microfone…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Permissão negada é escolha do usuário, não erro do site.
      estado.textContent = '';
      box.append(el('p', { class: 'item__nota' },
        'Sem acesso ao microfone. A tarefa continua valendo: diga em voz alta '
        + 'e compare com o modelo. Para gravar, libere o microfone para este site.'));
      gravar.disabled = true;
      return;
    }

    const pedacos = [];
    rec = new MediaRecorder(stream, { mimeType: melhorMime() });
    rec.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };
    rec.onstop = () => {
      soltar();
      // Revoga a URL anterior: regravar várias vezes seguidas vazaria uma
      // URL de objeto por tentativa.
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob(pedacos, { type: rec.mimeType || 'audio/webm' }));
      audio.setAttribute('src', url);
      audio.hidden = false;
      gravar.textContent = '⏺ Regravar';
      gravar.hidden = false;
      parar.hidden = true;
      estado.textContent = 'gravado — não fica salvo ao sair da página';
    };

    rec.start();
    gravar.hidden = true;
    parar.hidden = false;
    estado.textContent = 'gravando…';
  });

  parar.addEventListener('click', () => {
    try {
      rec?.stop();
    } catch {
      soltar();
    }
  });

  box.append(linha, audio);
  return box;
}

function botaoModelo(onModel) {
  const b = el('button', { class: 'btn btn--sm', type: 'button' }, '🔊 Modelo');
  b.addEventListener('click', () => onModel());
  return b;
}
