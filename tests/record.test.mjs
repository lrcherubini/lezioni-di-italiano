/* Gravação de voz na Produzione.

   Arquivo próprio porque instala globais de processo (MediaRecorder,
   navigator.mediaDevices, URL.createObjectURL) e porque o caminho mais
   importante — SEM a API — depende de eles não existirem.

   A ordem dos cenários aqui não é acidental: o degradado vem primeiro,
   porque é o que o projeto promete em NF5. Um botão morto sem explicação é
   pior do que não ter botão. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const { recorder, supported } = await import('../js/record.js');

/* --- Dublês --------------------------------------------------------------- */

function instalarMedia({ negaPermissao = false } = {}) {
  const tracks = [{ stop() { this.parado = true; }, parado: false }];

  globalThis.navigator = {
    mediaDevices: {
      getUserMedia: async () => {
        if (negaPermissao) throw new Error('NotAllowedError');
        return { getTracks: () => tracks };
      },
    },
  };

  class FakeRecorder {
    static isTypeSupported(m) { return m === 'audio/webm'; }
    constructor(stream, opts) {
      this.stream = stream;
      this.mimeType = opts?.mimeType;
      FakeRecorder.ultima = this;
    }
    start() { this.ativo = true; }
    stop() {
      this.ativo = false;
      this.ondataavailable?.({ data: { size: 10 } });
      this.onstop?.();
    }
  }
  globalThis.MediaRecorder = FakeRecorder;

  const urls = { criadas: 0, revogadas: 0 };
  globalThis.URL = {
    createObjectURL: () => { urls.criadas += 1; return `blob:fake-${urls.criadas}`; },
    revokeObjectURL: () => { urls.revogadas += 1; },
  };
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };

  return { tracks, urls, Rec: FakeRecorder };
}

function desinstalarMedia() {
  delete globalThis.navigator;
  delete globalThis.MediaRecorder;
}

/* --- Sem API: o caminho que NF5 promete ---------------------------------- */

describe('sem suporte a gravação', () => {
  test('supported() é false quando falta a API', () => {
    desinstalarMedia();
    assert.equal(supported(), false);
  });

  test('a etapa continua utilizável e EXPLICA por que não grava', () => {
    desinstalarMedia();
    const box = recorder({});
    assert.equal(box.querySelectorAll('button').length, 0, 'nenhum botão morto');
    assert.match(box.textContent, /não grava áudio/);
    assert.match(box.textContent, /diga em voz alta/, 'a tarefa continua valendo');
  });

  test('o modelo continua tocável mesmo sem gravador', async () => {
    desinstalarMedia();
    let tocou = 0;
    const box = recorder({ onModel: () => { tocou += 1; } });
    const b = box.querySelectorAll('button')[0];
    assert.match(b.textContent, /Modelo/);
    b.dispatchEvent({ type: 'click' });
    assert.equal(tocou, 1);
  });
});

/* --- Com API -------------------------------------------------------------- */

describe('com suporte a gravação', () => {
  test('supported() é true e a UI nasce pronta para gravar', () => {
    instalarMedia();
    const box = recorder({});
    assert.equal(supported(), true);

    const gravar = box.querySelectorAll('button')[0];
    assert.match(gravar.textContent, /Gravar/);
    assert.equal(box.querySelector('.rec__player').hidden, true, 'o player só aparece depois');
  });

  test('gravar → parar produz um áudio tocável e avisa que é efêmero', async () => {
    const { Rec } = instalarMedia();
    const box = recorder({});
    const [gravar, parar] = box.querySelectorAll('button');

    gravar.dispatchEvent({ type: 'click' });
    await flush();
    assert.equal(gravar.hidden, true);
    assert.equal(parar.hidden, false);
    assert.match(box.querySelector('.rec__stato').textContent, /gravando/);

    Rec.ultima.stop();
    assert.equal(box.querySelector('.rec__player').hidden, false);
    assert.ok(box.querySelector('.rec__player').getAttribute('src').startsWith('blob:'));
    assert.match(box.querySelector('.rec__stato').textContent, /não fica salvo/);
    assert.match(gravar.textContent, /Regravar/);
  });

  test('soltar o microfone ao parar — senão o indicador do sistema fica aceso', async () => {
    const { Rec, tracks } = instalarMedia();
    const box = recorder({});
    box.querySelectorAll('button')[0].dispatchEvent({ type: 'click' });
    await flush();
    Rec.ultima.stop();
    assert.equal(tracks[0].parado, true);
  });

  test('regravar revoga a URL anterior — senão vaza uma por tentativa', async () => {
    const { Rec, urls } = instalarMedia();
    const box = recorder({});
    const gravar = box.querySelectorAll('button')[0];

    gravar.dispatchEvent({ type: 'click' }); await flush();
    Rec.ultima.stop();
    gravar.dispatchEvent({ type: 'click' }); await flush();
    Rec.ultima.stop();

    assert.equal(urls.criadas, 2);
    assert.equal(urls.revogadas, 1, 'a primeira URL foi revogada');
  });

  test('escolhe um mimeType que o navegador aceita', async () => {
    const { Rec } = instalarMedia();
    const box = recorder({});
    box.querySelectorAll('button')[0].dispatchEvent({ type: 'click' });
    await flush();
    assert.equal(Rec.ultima.mimeType, 'audio/webm');
  });
});

/* --- Permissão negada ----------------------------------------------------- */

describe('permissão negada', () => {
  test('não é tratada como erro do site, e a tarefa segue valendo', async () => {
    instalarMedia({ negaPermissao: true });
    const box = recorder({});
    const gravar = box.querySelectorAll('button')[0];

    gravar.dispatchEvent({ type: 'click' });
    await flush();

    assert.match(box.textContent, /Sem acesso ao microfone/);
    assert.match(box.textContent, /diga em voz alta/);
    assert.equal(gravar.disabled, true, 'não insiste num botão que não vai funcionar');
    assert.equal(box.querySelector('.rec__player').hidden, true);
  });
});
