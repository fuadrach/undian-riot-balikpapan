/* =========================================================
   Chill n Sunset - Mini Gath Riot Balikpapan
   Aplikasi Undian  |  app.js
   Alur: pilih hadiah -> isi jumlah -> undi -> stop ->
         (pengundian lagi)  atau  (pengundian selesai)
   ========================================================= */
(function () {
  'use strict';

  const LS_STATE = 'undian_riot_bpp_state_v2';

  /* ---------- STATE ---------- */
  const state = {
    raw: [],                 // daftar mentah peserta {name,g,t,u}
    participants: [],        // setelah dedupe + dirapikan
    dedupe: false,
    hadiah: ['BIZNET', 'PANITIA', '@OTEOTE_PROJECT', 'GULF', 'AHY Foundation (H. Ahmad)'],
    rencana: [],             // [{items:[{prize, jumlah}]}] susunan tiap pengundian
    sesi: [],                // [{ronde, winners:[{name, prize}]}] hasil yang sudah dikunci
    current: null,           // pengundian berjalan {ronde, items, slots, winners}
    phase: 'setup'           // setup | rolling | stopping | hasil
  };

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    setupPanel: $('setupPanel'), setupToggle: $('setupToggle'),
    fileInput: $('fileInput'), fileDrop: $('fileDrop'),
    btnTemplate: $('btnTemplate'), btnManual: $('btnManual'), btnManage: $('btnManage'),
    btnClearPeserta: $('btnClearPeserta'),
    manualBox: $('manualBox'), manualText: $('manualText'), btnManualSave: $('btnManualSave'),
    chkDedupe: $('chkDedupe'), pesertaInfo: $('pesertaInfo'), pesertaList: $('pesertaList'),

    undiForm: $('undiForm'), pilihHadiah: $('pilihHadiah'), jumlahUndi: $('jumlahUndi'),
    btnKelolaHadiah: $('btnKelolaHadiah'), hadiahBox: $('hadiahBox'), hadiahList: $('hadiahList'),
    hadiahBaru: $('hadiahBaru'), btnTambahHadiah: $('btnTambahHadiah'),
    warnLine: $('warnLine'), poolNote: $('poolNote'),

    stage: $('stage'), stagePrize: $('stagePrize'), slots: $('slotsUndian'),
    statusLine: $('statusLine'), hint: $('hint'), rencanaBox: $('rencanaBox'),
    btnStart: $('btnStart'), btnStop: $('btnStop'), btnLagi: $('btnLagi'), btnSelesai: $('btnSelesai'),
    btnSound: $('btnSound'), btnFull: $('btnFull'),
    riwayat: $('riwayat'), hasilAkhir: $('hasilAkhir'),
    btnReset: $('btnReset'), btnSelesaiBawah: $('btnSelesaiBawah'),
    modal: $('modal'), modalTitle: $('modalTitle'), modalText: $('modalText'),
    modalYes: $('modalYes'), modalNo: $('modalNo'),
    confetti: $('confetti')
  };

  /* =========================================================
     AUDIO - drum roll & fanfare disintesis (tanpa file audio)
     ========================================================= */
  const AudioFX = (function () {
    let ctx = null, noiseBuf = null, timer = null, enabled = true, rumble = null;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        const len = Math.floor(ctx.sampleRate * 2);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function snare(t, gain, freq, dur) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.03);
    }

    function startRoll() {
      if (!enabled || !ensure()) return;
      stopRoll();
      let next = ctx.currentTime + 0.04;
      let gap = 0.042;
      rumble = ctx.createOscillator();
      const rg = ctx.createGain();
      rumble.type = 'sine'; rumble.frequency.setValueAtTime(48, ctx.currentTime);
      rg.gain.setValueAtTime(0.0001, ctx.currentTime);
      rg.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 2.5);
      rumble.connect(rg).connect(ctx.destination);
      rumble.start();
      rumble._g = rg;

      timer = setInterval(function () {
        if (!ctx) return;
        const now = ctx.currentTime;
        while (next < now + 0.22) {
          snare(next, 0.14 + Math.random() * 0.07, 1500 + Math.random() * 1100, 0.07);
          next += gap;
        }
        gap = Math.max(0.021, gap * 0.985);
      }, 60);
    }

    function stopRoll() {
      if (timer) { clearInterval(timer); timer = null; }
      if (rumble) {
        try {
          rumble._g.gain.cancelScheduledValues(ctx.currentTime);
          rumble._g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
          rumble.stop(ctx.currentTime + 0.4);
        } catch (e) { /* noop */ }
        rumble = null;
      }
    }

    function tick(high) {
      if (!enabled || !ensure()) return;
      snare(ctx.currentTime, high ? 0.26 : 0.18, high ? 2600 : 1900, high ? 0.12 : 0.08);
    }

    function cymbal(t, gain, dur, out) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp).connect(g).connect(out || ctx.destination);
      src.start(t); src.stop(t + dur + 0.1);
    }

    function kick(t, out) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.75, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(out || ctx.destination);
      o.start(t); o.stop(t + 0.48);
    }

    function chord(freqs, t, dur, gain, type, out) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5200, t);
      lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lp.connect(g).connect(out || ctx.destination);
      freqs.forEach(function (f) {
        const o = ctx.createOscillator();
        o.type = type || 'sawtooth';
        o.frequency.value = f;
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.05);
      });
    }

    // "jeng… jeng… jeng!" lalu akor kemenangan
    function fanfare() {
      if (!enabled || !ensure()) return;
      const t = ctx.currentTime + 0.02;

      // kompresor + penguat: fanfare terdengar jelas tanpa pecah
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24;
      comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.25;
      const master = ctx.createGain();
      master.gain.value = 1.5;
      comp.connect(master).connect(ctx.destination);

      [{ off: 0, f: [130.81, 196, 261.63] },
       { off: 0.30, f: [146.83, 220, 293.66] },
       { off: 0.60, f: [164.81, 246.94, 329.63] }].forEach(function (j) {
        chord(j.f, t + j.off, 0.32, 0.3, 'sawtooth', comp);
        kick(t + j.off, comp);
        cymbal(t + j.off, 0.16, 0.22, comp);
      });
      const fin = t + 1.0;
      chord([174.61, 261.63, 349.23, 440, 523.25], fin, 2.8, 0.34, 'sawtooth', comp);
      kick(fin, comp);
      cymbal(fin, 0.4, 2.5, comp);
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        const st = fin + 0.12 + i * 0.075;
        og.gain.setValueAtTime(0.0001, st);
        og.gain.linearRampToValueAtTime(0.2, st + 0.02);
        og.gain.exponentialRampToValueAtTime(0.0001, st + 1.6);
        o.connect(og).connect(comp);
        o.start(st); o.stop(st + 1.65);
      });
    }

    return {
      startRoll: startRoll, stopRoll: stopRoll, tick: tick, fanfare: fanfare,
      toggle: function () { enabled = !enabled; if (!enabled) stopRoll(); return enabled; },
      unlock: ensure
    };
  })();

  /* =========================================================
     KONFETI & PITA
     ========================================================= */
  const Confetti = (function () {
    const cv = el.confetti, cx = cv.getContext('2d');
    let parts = [], raf = null;
    const colors = ['#ffd479', '#ff8a3d', '#ff4d6d', '#fff4e6', '#c77dff', '#ffe9a8'];
    function resize() { cv.width = innerWidth; cv.height = innerHeight; }
    addEventListener('resize', resize); resize();

    function burst(n) {
      n = n || 150;
      for (let i = 0; i < n; i++) {
        parts.push({
          t: 'c',
          x: Math.random() * cv.width,
          y: -20 - Math.random() * cv.height * 0.4,
          w: 6 + Math.random() * 8, h: 8 + Math.random() * 12,
          vy: 2 + Math.random() * 4, vx: -1.6 + Math.random() * 3.2,
          rot: Math.random() * Math.PI, vr: -0.12 + Math.random() * 0.24,
          c: colors[(Math.random() * colors.length) | 0]
        });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function ribbons(n) {
      n = n || 40;
      for (let i = 0; i < n; i++) {
        const kiri = i % 2 === 0;
        const kuat = 13 + Math.random() * 9;
        const sudut = (52 + Math.random() * 26) * Math.PI / 180;
        parts.push({
          t: 'r',
          x: kiri ? -20 : cv.width + 20,
          y: cv.height + 10,
          vx: (kiri ? 1 : -1) * Math.cos(sudut) * kuat,
          vy: -Math.sin(sudut) * kuat,
          w: 4 + Math.random() * 5,
          h: 46 + Math.random() * 70,
          rot: Math.random() * Math.PI,
          vr: -0.06 + Math.random() * 0.12,
          fase: Math.random() * Math.PI * 2,
          amp: 4 + Math.random() * 7,
          c: colors[(Math.random() * colors.length) | 0]
        });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function tick() {
      cx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter(function (p) {
        return p.y < cv.height + 160 && p.x > -260 && p.x < cv.width + 260;
      });
      parts.forEach(function (p) {
        cx.save();
        if (p.t === 'r') {
          p.x += p.vx; p.y += p.vy;
          p.vy += 0.24; p.vx *= 0.985;
          p.rot += p.vr; p.fase += 0.22;
          cx.translate(p.x, p.y);
          cx.rotate(p.rot + Math.sin(p.fase * 0.5) * 0.25);
          cx.beginPath();
          const seg = 7;
          for (let s = 0; s <= seg; s++) {
            const yy = -p.h / 2 + (p.h / seg) * s;
            const xx = Math.sin(p.fase + s * 0.8) * p.amp;
            if (s) cx.lineTo(xx, yy); else cx.moveTo(xx, yy);
          }
          cx.strokeStyle = p.c; cx.lineWidth = p.w; cx.lineCap = 'round';
          cx.globalAlpha = .92;
          cx.stroke();
        } else {
          p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.035;
          cx.translate(p.x, p.y); cx.rotate(p.rot);
          cx.fillStyle = p.c; cx.globalAlpha = .9;
          cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        cx.restore();
      });
      if (parts.length) { raf = requestAnimationFrame(tick); }
      else { cx.clearRect(0, 0, cv.width, cv.height); raf = null; }
    }
    function clear() { parts = []; cx.clearRect(0, 0, cv.width, cv.height); }
    return { burst: burst, ribbons: ribbons, clear: clear };
  })();

  /* =========================================================
     UTIL
     ========================================================= */
  function randInt(max) {
    if (max <= 0) return 0;
    if (window.crypto && crypto.getRandomValues) {
      const limit = Math.floor(4294967296 / max) * max;
      const buf = new Uint32Array(1);
      let x;
      do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
      return x % max;
    }
    return Math.floor(Math.random() * max);
  }
  function sampleUnique(arr, n) {
    const a = arr.slice(), out = [];
    n = Math.min(n, a.length);
    for (let i = 0; i < n; i++) {
      const j = i + randInt(a.length - i);
      const t = a[i]; a[i] = a[j]; a[j] = t;
      out.push(a[i]);
    }
    return out;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // "pak trish" / "PAK TRISH" -> "Pak Trish"
  function rapikanNama(s) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
    try {
      return s.replace(/(^|[^\p{L}\p{N}])([\p{L}\p{N}])/gu, function (m, a, b) { return a + b.toUpperCase(); });
    } catch (e) {
      return s.replace(/(^|[^a-z0-9])([a-z0-9])/g, function (m, a, b) { return a + b.toUpperCase(); });
    }
  }
  function showError(msg) {
    el.pesertaInfo.textContent = '⚠ ' + msg;
    el.pesertaInfo.classList.add('err');
  }
  function warn(msg) {
    el.warnLine.textContent = '⚠ ' + msg;
    el.warnLine.classList.remove('hidden');
    el.warnLine.classList.remove('shake');
    void el.warnLine.offsetWidth;
    el.warnLine.classList.add('shake');
  }
  function clearWarn() { el.warnLine.classList.add('hidden'); }

  /* ---------- dialog konfirmasi ---------- */
  let modalAksi = null;
  function konfirmasi(judul, teks, tombol, aksi) {
    el.modalTitle.textContent = judul;
    el.modalText.textContent = teks;
    el.modalYes.textContent = tombol;
    modalAksi = aksi;
    el.modal.classList.remove('hidden');
  }
  el.modalNo.addEventListener('click', function () { el.modal.classList.add('hidden'); modalAksi = null; });
  el.modal.addEventListener('click', function (e) { if (e.target === el.modal) el.modalNo.click(); });
  el.modalYes.addEventListener('click', function () {
    el.modal.classList.add('hidden');
    const a = modalAksi; modalAksi = null;
    if (a) a();
  });

  /* =========================================================
     PENYIMPANAN
     ========================================================= */
  // hasil versi lama (satu hadiah per sesi) dibaca ulang ke bentuk baru
  function bacaSesi(daftar) {
    return (daftar || []).map(function (x, i) {
      return {
        ronde: parseInt(x.ronde, 10) || (i + 1),
        winners: (x.winners || []).map(function (w) {
          return { name: rapikanNama(w.name), prize: w.prize || x.prize || '' };
        })
      };
    });
  }

  function save() {
    if (window.Store) {
      Store.simpan({
        raw: state.raw, dedupe: state.dedupe,
        hadiah: state.hadiah, sesi: state.sesi, rencana: state.rencana
      });
      return;
    }
    try {
      const lama = JSON.parse(localStorage.getItem(LS_STATE) || '{}') || {};
      lama.raw = state.raw;
      lama.dedupe = state.dedupe;
      lama.hadiah = state.hadiah;
      lama.sesi = state.sesi;
      lama.savedAt = Date.now();
      localStorage.setItem(LS_STATE, JSON.stringify(lama));
    } catch (e) { /* noop */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_STATE) || 'null');
      if (!s) return;
      state.raw = (s.raw || []).map(function (p) {
        return {
          name: rapikanNama(p.name),
          g: p.g === 'P' ? 'P' : 'L',
          t: p.t === false ? false : true,
          u: p.u === false ? false : true,
          h: p.h === true,
          jam: typeof p.jam === 'string' ? p.jam : ''
        };
      });
      state.dedupe = !!s.dedupe;
      if (Array.isArray(s.hadiah) && s.hadiah.length) state.hadiah = s.hadiah.slice();
      if (Array.isArray(s.sesi)) state.sesi = bacaSesi(s.sesi);
      if (Array.isArray(s.rencana) && s.rencana.length) state.rencana = salinRencana(s.rencana);
    } catch (e) { /* noop */ }
  }

  /* =========================================================
     PESERTA
     ========================================================= */
  function applyDedupe() {
    const list = state.raw.map(function (p, i) {
      return {
        name: rapikanNama(p.name),
        g: p.g === 'P' ? 'P' : 'L',
        t: p.t === false ? false : true,
        u: p.u === false ? false : true,
        h: p.h === true,                 // hadir; belum diabsen = false
        jam: typeof p.jam === 'string' ? p.jam : '',
        _i: i
      };
    });
    if (!state.dedupe) { state.participants = list; return; }
    const seen = Object.create(null);
    state.participants = list.filter(function (p) {
      const k = p.name.toLowerCase();
      if (seen[k]) return false;
      seen[k] = 1; return true;
    });
  }

  // kata pada nama hadiah yang jelas bukan nama orang
  const KATA_UMUM = {
    dari: 1, oleh: 1, untuk: 1, dan: 1, buat: 1, by: 1, from: 1, for: 1, and: 1, the: 1,
    hadiah: 1, prize: 1, doorprize: 1, door: 1, grand: 1, main: 1, utama: 1, hiburan: 1,
    sponsor: 1, sponsored: 1, persembahan: 1, voucher: 1, kupon: 1, paket: 1, bonus: 1,
    spesial: 1, special: 1,
    // kata peran, bukan nama orang
    panitia: 1, crew: 1, committee: 1, tim: 1, team: 1, peserta: 1, undian: 1
  };

  const RE_BUKAN_HURUF = (function () {
    try { return new RegExp('[^\\p{L}\\p{N}]+', 'gu'); }
    catch (e) { return /[^a-z0-9]+/g; }
  })();

  // pecah teks jadi kata yang layak dianggap nama (>=3 huruf, bukan kata umum)
  function kataNama(teks) {
    return String(teks == null ? '' : teks).toLowerCase()
      .replace(RE_BUKAN_HURUF, ' ').trim().split(' ')
      .filter(function (k) { return k.length >= 3 && !KATA_UMUM[k]; });
  }

  // nama peserta muncul di nama hadiah? mis. "Ahmad" vs "Baju Kalcer Dari Ahmad"
  // — pemberi hadiah tidak boleh memenangkan hadiahnya sendiri
  function namaAdaDiHadiah(nama, prize) {
    if (!prize) return false;
    const kata = Object.create(null);
    kataNama(prize).forEach(function (k) { kata[k] = 1; });
    return kataNama(nama).some(function (k) { return kata[k]; });
  }

  // Hadiah yang namanya memuat "panitia" disediakan untuk peserta ber-status
  // Ikut Undian = NOT (panitia yang bertugas). Mereka hanya ikut hadiah ini,
  // dan peserta undian biasa tidak ikut hadiah ini.
  function hadiahPanitia(prize) {
    return /panitia/i.test(String(prize == null ? '' : prize));
  }

  /* =========================================================
     RENCANA PENGUNDIAN
     Tiap pengundian berisi beberapa hadiah sekaligus. Jumlahnya
     menyesuaikan kehadiran: hadiah penyeimbang untuk peserta biasa
     (BIZNET) dan untuk panitia (PANITIA) dikurangi bila ada yang
     tidak hadir, dan pengurangannya dibagi rata ke Pengundian Ke-1
     dan Ke-2.
     ========================================================= */
  const RENCANA_BAWAAN = [
    { items: [{ prize: 'BIZNET', jumlah: 16 }, { prize: 'PANITIA', jumlah: 5 }] },
    { items: [{ prize: 'BIZNET', jumlah: 18 }, { prize: 'PANITIA', jumlah: 5 }] },
    { items: [{ prize: 'BIZNET', jumlah: 1 }, { prize: '@OTEOTE_PROJECT', jumlah: 2 },
              { prize: 'GULF', jumlah: 3 }, { prize: 'AHY Foundation (H. Ahmad)', jumlah: 2 }] },
    { items: [{ prize: '@OTEOTE_PROJECT', jumlah: 4 }, { prize: 'GULF', jumlah: 3 },
              { prize: 'AHY Foundation (H. Ahmad)', jumlah: 3 }] }
  ];

  function salinRencana(r) {
    return (r || []).map(function (x) {
      return { items: (x.items || []).map(function (it) {
        return { prize: String(it.prize == null ? '' : it.prize), jumlah: Math.max(0, parseInt(it.jumlah, 10) || 0) };
      }) };
    });
  }

  // hadiah penyeimbang untuk tiap kolam peserta
  function penyeimbang(untukPanitia) {
    const hit = {};
    state.rencana.forEach(function (r) {
      r.items.forEach(function (it) {
        if (hadiahPanitia(it.prize) !== !!untukPanitia) return;
        hit[it.prize] = (hit[it.prize] || 0) + it.jumlah;
      });
    });
    let nama = '', besar = -1;
    Object.keys(hit).forEach(function (k) { if (hit[k] > besar) { besar = hit[k]; nama = k; } });
    return nama;
  }

  function jmlHadirStatus(ikutUndian) {
    return state.participants.filter(function (p) {
      return p.h && (ikutUndian ? p.u !== false : p.u === false);
    }).length;
  }

  /* Rencana setelah disesuaikan dengan jumlah yang hadir.
     Sisa peserta yang tidak tertampung hadiah tetap dibiarkan —
     pengurangan hanya pada hadiah penyeimbang. */
  function rencanaEfektif() {
    const rencana = salinRencana(state.rencana);
    if (!rencana.length) return rencana;

    [false, true].forEach(function (untukPanitia) {
      const nama = penyeimbang(untukPanitia);
      if (!nama) return;
      const kunci = nama.trim().toLowerCase();

      // total hadiah selain penyeimbang untuk kolam yang sama
      let tetap = 0, bawaan = 0;
      const posisi = [];   // indeks ronde yang memuat hadiah penyeimbang
      rencana.forEach(function (r, ri) {
        r.items.forEach(function (it, ii) {
          if (hadiahPanitia(it.prize) !== untukPanitia) return;
          if (it.prize.trim().toLowerCase() === kunci) {
            bawaan += it.jumlah;
            posisi.push({ ri: ri, ii: ii, awal: it.jumlah });
          } else tetap += it.jumlah;
        });
      });
      if (!posisi.length) return;

      const hadir = jmlHadirStatus(!untukPanitia);
      let perlu = Math.max(0, hadir - tetap);        // jatah penyeimbang
      let kurang = bawaan - perlu;                    // berapa yang harus dipangkas
      if (kurang <= 0) return;

      // pangkas dari ronde-ronde awal (Ke-1 dan Ke-2), dibagi rata
      const sasaran = posisi.slice(0, 2).length ? posisi.slice(0, 2) : posisi;
      let sisa = kurang;
      // bagi rata dulu
      const perSasaran = Math.floor(sisa / sasaran.length);
      sasaran.forEach(function (t) {
        const ambil = Math.min(t.awal, perSasaran);
        rencana[t.ri].items[t.ii].jumlah -= ambil;
        t.awal -= ambil;
        sisa -= ambil;
      });
      // sisa pembagian dan kekurangan diambil berurutan
      for (let putaran = 0; putaran < 2 && sisa > 0; putaran++) {
        for (let i = 0; i < posisi.length && sisa > 0; i++) {
          const t = posisi[i];
          const kini = rencana[t.ri].items[t.ii].jumlah;
          const ambil = Math.min(kini, sisa);
          rencana[t.ri].items[t.ii].jumlah = kini - ambil;
          sisa -= ambil;
        }
      }
    });

    return rencana;
  }

  // Nomor pemenang diulang dari 1 setiap hadiahnya berganti.
  // daftar boleh berisi objek {prize} atau langsung nama hadiah.
  function nomorPerHadiah(daftar) {
    const nomor = [];
    let sebelum = null, n = 0;
    (daftar || []).forEach(function (x) {
      const k = String((x && x.prize !== undefined ? x.prize : x) || '').trim().toLowerCase();
      if (k !== sebelum) { sebelum = k; n = 0; }
      nomor.push(++n);
    });
    return nomor;
  }

  function jumlahRonde(r) {
    return r.items.reduce(function (a, it) { return a + it.jumlah; }, 0);
  }

  function ringkasRonde(r) {
    return r.items.filter(function (it) { return it.jumlah > 0; })
      .map(function (it) { return it.jumlah + ' ' + it.prize; }).join(' + ');
  }

  // ronde yang sudah dikunci hasilnya
  function rondeSelesai() {
    const set = Object.create(null);
    state.sesi.forEach(function (s) { if (s.ronde) set[s.ronde] = 1; });
    return set;
  }

  function rondeBerikut() {
    const sudah = rondeSelesai();
    const eff = rencanaEfektif();
    for (let i = 0; i < eff.length; i++) {
      if (!sudah[i + 1] && jumlahRonde(eff[i]) > 0) return i + 1;
    }
    return 0;
  }

  function jmlHadir() {
    return state.participants.filter(function (p) { return p.h; }).length;
  }

  // peserta yang boleh diundi: HADIR, ikut undian, belum pernah menang,
  // dan (bila hadiah disebut) namanya tidak tercantum di nama hadiah itu
  function poolUndian(prize, abaikanNamaHadiah) {
    const menang = Object.create(null);
    state.sesi.forEach(function (s) {
      s.winners.forEach(function (w) { menang[w.name.toLowerCase()] = 1; });
    });
    if (state.current) {
      state.current.winners.forEach(function (w) { menang[w.name.toLowerCase()] = 1; });
    }
    const untukPanitia = hadiahPanitia(prize);
    return state.participants.filter(function (p) {
      if (!p.h) return false;                                  // harus hadir
      // hadiah panitia: hanya yang NOT; hadiah lain: hanya yang ikut undian
      if (untukPanitia ? p.u !== false : p.u === false) return false;
      if (menang[p.name.toLowerCase()]) return false;
      return abaikanNamaHadiah || !namaAdaDiHadiah(p.name, prize);
    });
  }

  // nama yang ditahan khusus untuk hadiah ini (untuk diberitahukan ke operator)
  function namaDitahan(prize) {
    if (!prize) return [];
    return poolUndian(prize, true).filter(function (p) { return namaAdaDiHadiah(p.name, prize); })
      .map(function (p) { return p.name; });
  }

  function setParticipants(list, sourceLabel) {
    state.raw = list;
    renderPeserta(sourceLabel);
    save();
  }

  function renderPeserta(sourceLabel) {
    applyDedupe();
    el.pesertaInfo.classList.remove('err');
    const n = state.participants.length;
    // baris info peserta sengaja dikosongkan — hanya dipakai untuk pesan galat
    el.pesertaInfo.textContent = '';
    el.pesertaList.innerHTML = state.participants.slice(0, 400).map(function (p) {
      return '<span class="pchip' + (p.u === false ? ' nonundi' : '') + '"' +
        (p.u === false ? ' title="Tidak ikut undian"' : '') + '>' + esc(p.name) +
        '<button class="px" data-i="' + p._i + '" title="Hapus nama ini">×</button></span>';
    }).join('') + (n > 400 ? '<span class="pchip more">+' + (n - 400) + ' lainnya… buka Kelola Peserta</span>' : '');
    refresh();
  }

  function removeParticipant(i) {
    const p = state.raw[i];
    if (!p) return;
    if (state.dedupe) {
      const key = rapikanNama(p.name).toLowerCase();
      state.raw = state.raw.filter(function (x) { return rapikanNama(x.name).toLowerCase() !== key; });
    } else {
      state.raw.splice(i, 1);
    }
    renderPeserta('');
    save();
  }

  /* ---- baca Excel / CSV ---- */
  function handleFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();
    const reader = new FileReader();

    if (name.endsWith('.csv')) {
      reader.onload = function (e) { parseRows(csvToRows(e.target.result), file.name); };
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (typeof XLSX === 'undefined') {
      showError('Pustaka Excel gagal dimuat (butuh internet). Gunakan file .csv atau Input Manual.');
      return;
    }
    reader.onload = function (e) {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
        parseRows(rows, file.name);
      } catch (err) {
        showError('Gagal membaca file Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function csvToRows(text) {
    const first = text.split('\n')[0] || '';
    const sep = first.split(';').length > first.split(',').length ? ';' : ',';
    return text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; })
      .map(function (l) { return l.split(sep).map(function (c) { return c.replace(/^"|"$/g, '').trim(); }); });
  }

  function parseRows(rows, fname) {
    if (!rows || !rows.length) { showError('File kosong atau tidak terbaca.'); return; }

    let nameCol = 0, genderCol = -1, timCol = -1, undiCol = -1, start = 0;
    const head = rows[0].map(function (c) { return String(c).toLowerCase().trim(); });
    const hasHeader = head.some(function (c) { return /nama|name|peserta|participant/.test(c); });

    if (hasHeader) {
      head.forEach(function (c, i) {
        if (nameCol === 0 && /nama|name|peserta|participant/.test(c)) nameCol = i;
        if (genderCol < 0 && /^(jk|j\.k|gender|kelamin|jenis kelamin|l\/p|p\/l|sex)$/.test(c)) genderCol = i;
        if (timCol < 0 && /^(ikut tim|status tim|tim|ok tim)$/.test(c)) timCol = i;
        if (undiCol < 0 && /^(undian|ikut undian|undi|status undian|ok undian)$/.test(c)) undiCol = i;
      });
      start = 1;
    } else {
      const r0 = rows[0] || [];
      for (let i = 0; i < r0.length; i++) {
        const v = String(r0[i] == null ? '' : r0[i]).trim();
        if (v && !/^\d+[.)]?$/.test(v)) { nameCol = i; break; }
      }
    }

    const TIDAK = /^(not|not ok|notok|non|tidak|tdk|no|n|x|0|bertugas|panitia)$/i;
    const list = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i] || [];
      const nm = String(r[nameCol] == null ? '' : r[nameCol]).trim();
      if (!nm) continue;
      if (/^(no|nomor|#)$/i.test(nm)) continue;
      let g = 'L';
      if (genderCol >= 0) {
        const v = String(r[genderCol] == null ? '' : r[genderCol]).trim();
        if (/^(p|w|f|perempuan|wanita|female|cewe|cewek)$/i.test(v)) g = 'P';
      }
      let t = true;
      if (timCol >= 0 && TIDAK.test(String(r[timCol] == null ? '' : r[timCol]).trim())) t = false;
      let u = true;
      if (undiCol >= 0 && TIDAK.test(String(r[undiCol] == null ? '' : r[undiCol]).trim())) u = false;
      list.push({ name: rapikanNama(nm), g: g, t: t, u: u });
    }
    if (!list.length) { showError('Tidak ada nama yang ditemukan di file.'); return; }
    setParticipants(list, fname);
  }

  /* =========================================================
     DAFTAR HADIAH
     ========================================================= */
  function renderHadiah() {
    const terpilih = el.pilihHadiah.value;
    el.pilihHadiah.innerHTML = '<option value="">- Pilih Hadiah -</option>' +
      state.hadiah.map(function (h) {
        return '<option value="' + esc(h) + '">' + esc(h) + '</option>';
      }).join('');
    if (terpilih && state.hadiah.indexOf(terpilih) >= 0) el.pilihHadiah.value = terpilih;

    el.hadiahList.innerHTML = state.hadiah.map(function (h, i) {
      return '<div class="hrow" data-i="' + i + '">' +
        '<input type="text" class="hname" value="' + esc(h) + '">' +
        '<button class="btn ghost tiny hdel" title="Hapus hadiah">✖</button>' +
      '</div>';
    }).join('') || '<p class="mini-note">Belum ada hadiah. Tambahkan di bawah.</p>';
  }

  el.btnKelolaHadiah.addEventListener('click', function () {
    el.hadiahBox.classList.toggle('hidden');
    if (!el.hadiahBox.classList.contains('hidden')) el.hadiahBaru.focus();
  });
  el.hadiahList.addEventListener('input', function (e) {
    const inp = e.target.closest('.hname');
    if (!inp) return;
    const i = parseInt(inp.parentNode.dataset.i, 10);
    state.hadiah[i] = inp.value;
    save();
  });
  el.hadiahList.addEventListener('change', function () { renderHadiah(); });
  el.hadiahList.addEventListener('click', function (e) {
    const b = e.target.closest('.hdel');
    if (!b) return;
    state.hadiah.splice(parseInt(b.parentNode.dataset.i, 10), 1);
    save(); renderHadiah();
  });
  function tambahHadiah() {
    const v = el.hadiahBaru.value.trim();
    if (!v) return;
    state.hadiah.push(v);
    el.hadiahBaru.value = '';
    save(); renderHadiah();
    el.pilihHadiah.value = v;
    clearWarn();
  }
  el.btnTambahHadiah.addEventListener('click', tambahHadiah);
  el.hadiahBaru.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); tambahHadiah(); }
  });

  /* =========================================================
     TAMPILAN UMUM
     ========================================================= */
  function refresh() {
    const eff = rencanaEfektif();
    const sudah = rondeSelesai();
    const berikut = rondeBerikut();
    // pengundian yang sudah selesai tidak dipilih lagi — langsung maju
    let terpilih = parseInt(el.pilihHadiah.value, 10) || 0;
    if (!terpilih || sudah[terpilih]) terpilih = berikut;

    el.pilihHadiah.innerHTML = '<option value="">- Pilih Pengundian -</option>' +
      eff.map(function (r, i) {
        const n = i + 1, jml = jumlahRonde(r);
        return '<option value="' + n + '"' + (n === terpilih ? ' selected' : '') + '>' +
          'Pengundian Ke-' + n + ' · ' + jml + ' hadiah' +
          (sudah[n] ? ' (sudah)' : '') + '</option>';
      }).join('');

    const r = eff[terpilih - 1];
    el.jumlahUndi.value = r ? ringkasRonde(r) : '';

    const belum = state.participants.length - jmlHadir();
    const totalHadiah = eff.reduce(function (a, x) { return a + jumlahRonde(x); }, 0);

    el.poolNote.textContent = state.participants.length
      ? state.participants.length + ' peserta undian · ' + totalHadiah + ' hadiah' +
        (belum ? ' · 🚷 ' + belum + ' belum hadir' : '') +
        (state.sesi.length ? ' · ' + state.sesi.length + ' pengundian selesai' : '')
      : 'Upload daftar peserta dulu di panel Data Peserta.';

    renderRencana(eff);
    renderRiwayat();
  }

  // tabel susunan pengundian
  function renderRencana(eff) {
    if (!el.rencanaBox) return;
    const sudah = rondeSelesai();
    const asli = salinRencana(state.rencana);
    el.rencanaBox.innerHTML = eff.map(function (r, i) {
      const n = i + 1;
      const jml = jumlahRonde(r);
      const jmlAsli = asli[i] ? jumlahRonde(asli[i]) : jml;
      return '<div class="rrow' + (sudah[n] ? ' sudah' : '') + '">' +
        '<div class="rhead"><b>Pengundian Ke-' + n + '</b>' +
          '<span class="rjml">' + jml + ' hadiah' +
          (jml !== jmlAsli ? ' <i>(dari ' + jmlAsli + ')</i>' : '') + '</span></div>' +
        '<div class="rlist">' + r.items.map(function (it, j) {
          const awal = asli[i] && asli[i].items[j] ? asli[i].items[j].jumlah : it.jumlah;
          return '<span class="rit' + (it.jumlah === 0 ? ' nol' : '') + '">' +
            '<b>' + it.jumlah + '</b> ' + esc(it.prize) +
            (it.jumlah !== awal ? ' <i>(' + awal + ')</i>' : '') + '</span>';
        }).join('') + '</div>' +
      '</div>';
    }).join('') || '<p class="mini-note">Belum ada susunan pengundian.</p>';
  }

  // nomor urut awal untuk sesi ke-idx (lanjutan dari sesi sebelumnya berhadiah sama)
  function awalSesi(idx) {
    const k = String(state.sesi[idx].prize).trim().toLowerCase();
    let a = 0;
    for (let i = 0; i < idx; i++) {
      if (String(state.sesi[i].prize).trim().toLowerCase() === k) a += state.sesi[i].winners.length;
    }
    return a;
  }

  function renderRiwayat() {
    if (!state.sesi.length) { el.riwayat.innerHTML = ''; return; }
    el.riwayat.innerHTML =
      '<div class="board-head small"><span class="line"></span><h2>📋 HASIL SEMENTARA</h2><span class="line"></span></div>' +
      state.sesi.map(function (s, i) {
        const judul = 'Pengundian Ke-' + (s.ronde || (i + 1));
        const nomor = nomorPerHadiah(s.winners);
        return '<div class="sesi-card">' +
          '<div class="sesi-head">' +
            '<span class="sesi-prize">' + judul + '</span>' +
            '<span class="sesi-meta">' + s.winners.length + ' pemenang</span>' +
            '<button class="sesi-act wa-sesi" data-s="' + i + '" ' +
              'title="Kirim pemenang ' + esc(judul) + ' ke WhatsApp">💬 Kirim</button>' +
            '<button class="sesi-act salin-sesi" data-s="' + i + '" ' +
              'title="Salin teks pemenang ' + esc(judul) + '">📋 Salin</button>' +
          '</div>' +
          '<div class="sesi-names">' + s.winners.map(function (w, n) {
            return '<span title="' + esc(w.name) + (w.prize ? ' — ' + esc(w.prize) : '') + '">' +
              '<b class="wno">' + nomor[n] + '</b>' + esc(w.name) +
              (w.prize ? '<i class="wpz">' + esc(w.prize) + '</i>' : '') +
              '<button class="wx" data-s="' + i + '" data-w="' + n + '" ' +
              'title="Hapus dari daftar pemenang">×</button></span>';
          }).join('') + '</div>' +
        '</div>';
      }).join('') +
      '<div class="riwayat-actions">' +
        '<button class="btn wa" id="btnWaSemua">💬 Kirim Semua ke WhatsApp</button>' +
        '<button class="btn ghost" id="btnSalinSemua">📋 Salin Semua</button>' +
      '</div>' +
      '<p class="mini-note wa-note" id="waNoteRiwayat"></p>';
  }

  /* =========================================================
     TEKS PEMENANG & KIRIM KE WHATSAPP
     ========================================================= */
  // pecah daftar pemenang jadi kelompok berurutan per hadiah
  function kelompokHadiah(winners) {
    const grup = [];
    (winners || []).forEach(function (w) {
      const nama = w.prize || '';
      const akhir = grup[grup.length - 1];
      if (akhir && akhir.prize === nama) akhir.winners.push(w);
      else grup.push({ prize: nama, winners: [w] });
    });
    return grup;
  }

  // ikon kecil untuk tiap jenis hadiah
  function emotHadiah(prize) {
    return hadiahPanitia(prize) ? '🎖️' : '🎁';
  }

  // daftar: [{judul, winners:[{name, prize}]}] -> teks siap kirim (format WhatsApp)
  function teksDaftar(judul, daftar) {
    const GARIS = '━━━━━━━━━━━━━━━';
    let t = '*' + judul + '*\n' +
            'Chill n Sunset — Mini Gath Riot Balikpapan\n' +
            'Batakan Village, 27 September 2026\n';
    let total = 0;
    daftar.forEach(function (s) {
      // judul pengundian diapit garis; blok hadiah pertama langsung menyusul
      t += '\n' + GARIS + '\n*🎲 ' + s.judul + '*\n' + GARIS + '\n';
      kelompokHadiah(s.winners).forEach(function (g, gi) {
        t += (gi ? '\n' : '') + '*' + emotHadiah(g.prize) + ' ' +
             String(g.prize).toUpperCase() + ' [' + g.winners.length + ' HADIAH]*\n';
        g.winners.forEach(function (w, i) { t += (i + 1) + '. ' + w.name + '\n'; });
      });
      total += s.winners.length;
    });
    t += '\n' + GARIS + '\n_Total ' + total + ' pemenang' +
         (daftar.length > 1 ? ' dari ' + daftar.length + ' pengundian' : '') + '_';
    return t;
  }

  // seluruh pengundian yang sudah dikunci
  function daftarSesi() {
    return state.sesi.map(function (s, i) {
      return { judul: 'PENGUNDIAN KE-' + (s.ronde || (i + 1)), winners: s.winners };
    });
  }

  function teksSemuaSesi() {
    return teksDaftar('🏆 HASIL SEMENTARA UNDIAN', daftarSesi());
  }

  // buka WhatsApp dengan pesan yang sudah terisi
  function kirimWA(teks, noteId) {
    const note = noteId ? $(noteId) : null;
    if (note) {
      note.textContent = teks.length > 1500
        ? '⚠ Daftar cukup panjang (' + teks.length +
          ' karakter). Bila pesan terpotong di WhatsApp, pakai tombol Salin lalu tempel manual.'
        : 'WhatsApp dibuka di tab baru — pilih kontak atau grup, lalu kirim.';
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(teks), '_blank');
  }

  function salinTeks(teks, noteId) {
    const note = noteId ? $(noteId) : null;
    const ok = function () { if (note) note.textContent = '✔ Teks pemenang disalin — tinggal tempel di WhatsApp.'; };
    const manual = function () {
      const ta = document.createElement('textarea');
      ta.value = teks;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { if (note) note.textContent = '⚠ Gagal menyalin otomatis.'; }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(teks).then(ok, manual);
    } else manual();
  }

  // berapa pemenang hadiah ini yang sudah diundi pada sesi-sesi sebelumnya
  function offsetHadiah(prize) {
    const k = String(prize).trim().toLowerCase();
    return state.sesi.reduce(function (a, s) {
      return a + (String(s.prize).trim().toLowerCase() === k ? s.winners.length : 0);
    }, 0);
  }

  function slotHTML(i, w) {
    const hadiah = state.current ? (state.current.slots[i] || '') : '';
    const noSlot = state.current ? nomorPerHadiah(state.current.slots)[i] : i + 1;
    return '<div class="slot slot-main' + (w ? ' locked' : '') +
      '" data-i="' + i + '" data-prize="' + esc(hadiah) + '">' +
      '<div class="slot-mark"><span class="slot-badge">' + noSlot + '</span></div>' +
      '<div class="slot-body">' +
        '<div class="slot-name" title="' + (w ? esc(w.name) : '') + '">' + (w ? esc(w.name) : '—') + '</div>' +
        '<div class="slot-prize">' + esc(hadiah) + '</div>' +
      '</div></div>';
  }

  function renderSlots() {
    if (!state.current) { el.slots.innerHTML = ''; return; }
    const n = state.current.slots.length;
    let h = '', hadiahLalu = null;
    for (let i = 0; i < n; i++) {
      // garis pemisah tiap kali hadiahnya berganti
      const hadiah = state.current.slots[i] || '';
      if (hadiah !== hadiahLalu) {
        h += '<div class="slot-sep"><span class="ln"></span>' +
             '<b>HADIAH ' + esc(hadiah) + '</b><span class="ln"></span></div>';
        hadiahLalu = hadiah;
      }
      h += slotHTML(i, state.current.winners[i]);
    }
    el.slots.innerHTML = h;
    el.slots.classList.toggle('single', n === 1);
    el.slots.classList.toggle('fit', n > 1 && n <= 5);   // 2–5 pemenang: satu baris penuh
    el.slots.classList.toggle('per5', n > 5);            // lebih dari 5: 5 kartu per baris
    el.slots.classList.toggle('tight', n >= 4);
    el.slots.style.setProperty('--cols', n > 5 ? 5 : Math.max(1, n));
  }

  function allSlots() {
    return Array.prototype.slice.call(el.slots.querySelectorAll('.slot'));
  }

  /* =========================================================
     PENGUNDIAN
     ========================================================= */
  let rollHandle = null;

  function flashAll() {
    if (!state.current) return;
    const slots = allSlots();
    const simpanan = Object.create(null);          // kolam per hadiah, dihitung sekali per frame
    slots.forEach(function (s) {
      if (s.classList.contains('locked')) return;
      const hadiah = s.dataset.prize || '';
      let pool = simpanan[hadiah];
      if (!pool) { pool = simpanan[hadiah] = poolUndian(hadiah); }
      if (!pool.length) return;
      const p = pool[randInt(pool.length)];
      s.querySelector('.slot-name').textContent = p ? p.name : '';
    });
  }

  // pilih pemenang untuk seluruh isi satu pengundian
  function pilihPemenangRonde(items) {
    const dipakai = Object.create(null);
    const hasil = [];
    items.forEach(function (it) {
      if (it.jumlah <= 0) return;
      const pool = poolUndian(it.prize).filter(function (p) {
        return !dipakai[p.name.toLowerCase()];
      });
      sampleUnique(pool, it.jumlah).forEach(function (p) {
        dipakai[p.name.toLowerCase()] = 1;
        hasil.push({ name: p.name, prize: it.prize });
      });
    });
    return hasil;
  }

  function mulaiUndian() {
    if (state.phase !== 'setup') return;

    const ronde = parseInt(el.pilihHadiah.value, 10);
    if (!ronde) { warn('Pilih pengundian yang akan dijalankan.'); el.pilihHadiah.focus(); return; }
    if (!state.participants.length) { warn('Belum ada peserta. Upload daftar peserta dulu.'); return; }
    if (!jmlHadir()) {
      warn('Belum ada peserta yang ditandai hadir. Buka halaman Absensi dulu — ' +
           'hanya yang hadir yang ikut diundi.');
      return;
    }

    const eff = rencanaEfektif();
    const r = eff[ronde - 1];
    if (!r) { warn('Susunan pengundian ini tidak ditemukan.'); return; }

    const items = r.items.filter(function (it) { return it.jumlah > 0; });
    if (!items.length) {
      warn('Pengundian Ke-' + ronde + ' tidak punya hadiah untuk diundi ' +
           '(jumlahnya menjadi nol setelah menyesuaikan kehadiran).');
      return;
    }

    // pastikan tiap hadiah masih punya cukup calon pemenang
    const dipakai = Object.create(null);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const pool = poolUndian(it.prize).filter(function (p) { return !dipakai[p.name.toLowerCase()]; });
      if (pool.length < it.jumlah) {
        warn('Hadiah ' + it.prize + ' butuh ' + it.jumlah + ' pemenang, ' +
             'tapi hanya ada ' + pool.length + ' nama yang berhak dan hadir.');
        return;
      }
      pool.slice(0, it.jumlah).forEach(function (p) { dipakai[p.name.toLowerCase()] = 1; });
    }
    clearWarn();

    // satu slot untuk tiap hadiah yang diundi, berurutan sesuai susunan
    const slots = [];
    items.forEach(function (it) {
      for (let i = 0; i < it.jumlah; i++) slots.push(it.prize);
    });

    state.current = { ronde: ronde, items: items, slots: slots, winners: [] };
    state.phase = 'rolling';
    Confetti.clear();

    el.undiForm.classList.add('hidden');
    el.stage.classList.remove('hidden');
    el.stagePrize.textContent = 'PENGUNDIAN KE-' + ronde + ' · ' + slots.length + ' HADIAH';
    renderSlots();
    allSlots().forEach(function (s) { s.classList.add('rolling'); });
    el.statusLine.textContent = 'MENGUNDI ' + slots.length + ' pemenang (' + ringkasRonde(r) +
      ')… tekan STOP untuk menghentikan';
    el.btnStop.classList.remove('hidden');
    el.btnStop.disabled = false;
    el.btnLagi.classList.add('hidden');
    el.btnSelesai.classList.add('hidden');
    el.hint.innerHTML = 'Tekan <kbd>Spasi</kbd> atau tombol STOP untuk menghentikan undian.';

    AudioFX.unlock();
    AudioFX.startRoll();
    flashAll();
    if (rollHandle) clearInterval(rollHandle);
    rollHandle = setInterval(flashAll, 32);
  }

  function stopUndian() {
    if (state.phase !== 'rolling') return;
    state.phase = 'stopping';
    if (rollHandle) { clearInterval(rollHandle); rollHandle = null; }
    AudioFX.stopRoll();
    el.btnStop.disabled = true;
    el.statusLine.textContent = 'Mengerem…';

    const pemenang = pilihPemenangRonde(state.current.items);

    function paint(lock) {
      allSlots().forEach(function (s, i) {
        const w = pemenang[i];
        if (!w) return;
        const nm = s.querySelector('.slot-name');
        nm.textContent = w.name;
        nm.title = w.name;
        if (lock) { s.classList.remove('rolling', 'settling'); s.classList.add('locked'); }
      });
    }

    const DURASI = 3200;
    const t0 = performance.now();
    let sudahFinal = false;
    allSlots().forEach(function (s) { s.classList.add('settling'); });

    (function slowDown() {
      const p = Math.min(1, (performance.now() - t0) / DURASI);
      if (p < 1) {
        if (p >= 0.72) { if (!sudahFinal) { paint(false); sudahFinal = true; } }
        else flashAll();
        AudioFX.tick(false);
        setTimeout(slowDown, 32 + 430 * Math.pow(p, 1.9));
        return;
      }
      paint(true);
      selesaiSesi(pemenang);
    })();
  }

  function selesaiSesi(pemenang) {
    state.current.winners = pemenang;
    state.phase = 'hasil';
    el.btnStop.classList.add('hidden');
    el.btnStop.disabled = false;
    el.btnLagi.classList.remove('hidden');
    el.btnSelesai.classList.remove('hidden');
    el.statusLine.innerHTML = '✔ ' + pemenang.length + ' pemenang <b>Pengundian Ke-' +
      state.current.ronde + '</b> terpilih. Lanjut ke pengundian berikutnya, atau akhiri.';
    el.hint.textContent = 'Pengundian Lagi = jalankan pengundian berikutnya · Pengundian Selesai = tampilkan semua hasil.';

    // musik hanya berbunyi selama roll — setelah berhenti tidak ada suara.
    // (AudioFX.fanfare() sengaja tidak dipanggil; fungsinya disimpan bila nanti diperlukan lagi)
    AudioFX.stopRoll();
    Confetti.ribbons(26);
    setTimeout(function () { Confetti.ribbons(26); }, 300);
    setTimeout(function () { Confetti.ribbons(26); }, 600);
    setTimeout(function () { Confetti.burst(240); Confetti.ribbons(60); }, 1000);
    setTimeout(function () { Confetti.burst(150); Confetti.ribbons(30); }, 1700);
  }

  // simpan sesi berjalan ke daftar hasil
  function kunciSesi() {
    if (state.current && state.current.winners.length) {
      state.sesi.push({ ronde: state.current.ronde, winners: state.current.winners });
    }
    state.current = null;
    save();
  }

  function undiLagi() {
    kunciSesi();
    state.phase = 'setup';
    Confetti.clear();
    el.stage.classList.add('hidden');
    el.slots.innerHTML = '';
    el.undiForm.classList.remove('hidden');
    clearWarn();
    refresh();
    el.undiForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.pilihHadiah.focus();
  }

  /* ---------- hasil akhir (ditampilkan di halaman ini) ---------- */
  // hadiah yang sama digabung jadi satu daftar bernomor urut
  function rekapHadiah() {
    return daftarSesi().map(function (s) {
      return { prize: s.judul, judul: s.judul, winners: s.winners };
    });
  }

  function renderHasilAkhir() {
    const rekap = rekapHadiah();
    const total = rekap.reduce(function (a, s) { return a + s.winners.length; }, 0);
    el.hasilAkhir.innerHTML =
      '<div class="ann-badge">🏆 Pemenang Undian</div>' +
      rekap.map(function (s, si) {
        const besar = s.winners.length <= 3;
        const nomor = nomorPerHadiah(s.winners);
        return '<div class="board-section">' +
          '<div class="board-head has-act"><span class="line"></span><h2>🎲 ' +
            esc(s.judul.toUpperCase()) + '</h2><span class="line"></span>' +
            '<span class="bh-act">' +
              '<button class="sesi-act wa-sesi" data-h="' + si + '" ' +
                'title="Kirim pemenang ' + esc(s.judul) + ' ke WhatsApp">💬 Kirim</button>' +
              '<button class="sesi-act salin-sesi" data-h="' + si + '" ' +
                'title="Salin teks pemenang ' + esc(s.judul) + '">📋 Salin</button>' +
            '</span></div>' +
          (besar
            ? '<div class="ann-main">' + s.winners.map(function (w, i) {
                return '<div class="ann-card">' +
                  '<div class="crown"><span class="ann-no">' + nomor[i] + '</span></div>' +
                  '<div class="body"><div class="nm" title="' + esc(w.name) + '">' + esc(w.name) + '</div></div>' +
                  '<div class="pz">' + esc(w.prize || s.prize) + '</div>' +
                '</div>';
              }).join('') + '</div>'
            : '<div class="winners-sub">' + s.winners.map(function (w, i) {
                return '<div class="w-sub"><div class="no">' + nomor[i] + '</div>' +
                  '<div class="info"><div class="nm" title="' + esc(w.name) + '">' + esc(w.name) + '</div>' +
                  '<div class="dt">' + esc(w.prize || s.prize) + '</div></div></div>';
              }).join('') + '</div>') +
        '</div>';
      }).join('') +
      '<p class="ann-note">Total ' + total + ' pemenang dari ' + rekap.length + ' pengundian · ' +
        poolUndian().length + ' nama tersisa di kotak undian · ' +
        new Date().toLocaleString('id-ID') + '</p>' +
      '<div class="ann-actions">' +
        '<button class="btn wa" id="btnWaHasil">💬 Kirim ke WhatsApp</button>' +
        '<button class="btn ghost" id="btnSalinHasil">📋 Salin Teks</button>' +
        '<button class="btn ghost" id="btnCetakHasil">🖨 Cetak / PDF</button>' +
        '<button class="btn ghost" id="btnExcelHasil">⬇ Unduh Excel</button>' +
        '<button class="btn ghost" id="btnKembaliUndi">← Kembali Mengundi</button>' +
      '</div>' +
      '<p class="mini-note" id="waNote" style="text-align:center"></p>';

    function teksPemenang() { return teksDaftar('🏆 PEMENANG UNDIAN', rekap); }

    $('btnWaHasil').addEventListener('click', function () { kirimWA(teksPemenang(), 'waNote'); });
    $('btnSalinHasil').addEventListener('click', function () { salinTeks(teksPemenang(), 'waNote'); });

    $('btnCetakHasil').addEventListener('click', function () { window.print(); });
    $('btnKembaliUndi').addEventListener('click', tutupHasilAkhir);
    $('btnExcelHasil').addEventListener('click', function () {
      const rows = [['Pengundian', 'No', 'Nama Pemenang', 'Hadiah']];
      rekap.forEach(function (s) {
        const nomorX = nomorPerHadiah(s.winners);
        s.winners.forEach(function (w, i) { rows.push([s.judul, nomorX[i], w.name, w.prize || '']); });
      });
      if (typeof XLSX === 'undefined') {
        const csv = rows.map(function (r) {
          return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'pemenang-undian-chill-n-sunset.csv'; a.click();
        return;
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 20 }, { wch: 6 }, { wch: 30 }, { wch: 26 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pemenang');
      XLSX.writeFile(wb, 'pemenang-undian-chill-n-sunset.xlsx');
    });
  }

  function tutupHasilAkhir() {
    state.phase = 'setup';
    el.hasilAkhir.classList.add('hidden');
    el.undiForm.classList.remove('hidden');
    el.riwayat.classList.remove('hidden');
    document.querySelector('.final-actions').classList.remove('hidden');
    Confetti.clear();
    refresh();
  }

  function pengundianSelesai() {
    if (!state.sesi.length && !(state.current && state.current.winners.length)) {
      warn('Belum ada hasil undian untuk ditampilkan.');
      return;
    }
    konfirmasi('Pengundian selesai?',
      'Yakin ingin mengakhiri pengundian? Seluruh pemenang akan ditampilkan.',
      'Ya, Selesai', function () {
        kunciSesi();
        state.phase = 'selesai';
        el.undiForm.classList.add('hidden');
        el.stage.classList.add('hidden');
        el.riwayat.classList.add('hidden');
        document.querySelector('.final-actions').classList.add('hidden');
        renderHasilAkhir();
        el.hasilAkhir.classList.remove('hidden');
        el.hasilAkhir.scrollIntoView({ behavior: 'smooth', block: 'start' });
        Confetti.burst(260); Confetti.ribbons(50);
        setTimeout(function () { Confetti.burst(160); Confetti.ribbons(40); }, 900);
      });
  }

  function resetSemua() {
    konfirmasi('Reset semua pengundian?',
      'Seluruh hasil undian (' + state.sesi.length + ' hadiah) akan dihapus dan semua nama kembali masuk kotak undian. Daftar peserta tidak terhapus.',
      'Ya, Reset', function () {
        state.sesi = [];
        state.current = null;
        state.phase = 'setup';
        if (rollHandle) { clearInterval(rollHandle); rollHandle = null; }
        AudioFX.stopRoll();
        Confetti.clear();
        el.stage.classList.add('hidden');
        el.slots.innerHTML = '';
        el.undiForm.classList.remove('hidden');
        el.pilihHadiah.value = '';
        el.jumlahUndi.value = '';
        clearWarn();
        save();
        refresh();
      });
  }

  /* =========================================================
     EVENT
     ========================================================= */
  el.setupToggle.addEventListener('click', function () { el.setupPanel.classList.toggle('collapsed'); });

  el.fileDrop.addEventListener('click', function () { el.fileInput.click(); });
  el.fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    el.fileDrop.addEventListener(ev, function (e) { e.preventDefault(); el.fileDrop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    el.fileDrop.addEventListener(ev, function (e) { e.preventDefault(); el.fileDrop.classList.remove('over'); });
  });
  el.fileDrop.addEventListener('drop', function (e) {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  el.btnTemplate.addEventListener('click', function () {
    const contoh = [
      ['Nama', 'L/P', 'Ikut Tim', 'Ikut Undian'],
      ['Budi Santoso', 'L', 'OK', 'OK'],
      ['Siti Rahma', 'P', 'OK', 'OK'],
      ['Andi Pratama', 'L', 'NOT', 'OK'],
      ['Rudi Hartono', 'L', 'NOT', 'NOT']
    ];
    if (typeof XLSX === 'undefined') {
      const csv = contoh.map(function (r) { return r.join(','); }).join('\n') + '\n';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'template-peserta-undian.csv'; a.click();
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(contoh);
    ws['!cols'] = [{ wch: 30 }, { wch: 7 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Peserta');
    XLSX.writeFile(wb, 'template-peserta-undian.xlsx');
  });

  el.btnManual.addEventListener('click', function () {
    el.manualBox.classList.toggle('hidden');
    if (!el.manualBox.classList.contains('hidden')) {
      el.manualText.value = state.raw.map(function (p) { return p.name; }).join('\n');
      el.manualText.focus();
    }
  });
  el.btnManualSave.addEventListener('click', function () {
    const list = el.manualText.value.split('\n').map(function (l) { return l.trim(); })
      .filter(Boolean).map(function (l) { return { name: rapikanNama(l), g: 'L', t: true, u: true }; });
    if (!list.length) { showError('Daftar nama kosong.'); return; }
    setParticipants(list, 'input manual');
    el.manualBox.classList.add('hidden');
  });

  el.pesertaList.addEventListener('click', function (e) {
    const b = e.target.closest('.px');
    if (!b) return;
    const i = parseInt(b.dataset.i, 10);
    const p = state.raw[i];
    if (!p) return;
    konfirmasi('Hapus peserta?',
      '"' + rapikanNama(p.name) + '" akan dihapus dari daftar peserta.',
      'Ya, Hapus', function () { removeParticipant(i); });
  });

  el.btnManage.addEventListener('click', function () {
    const w = window.open('peserta.html', 'kelolaPeserta',
      'width=1160,height=820,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
    if (w) w.focus(); else location.href = 'peserta.html';
  });

  el.btnClearPeserta.addEventListener('click', function () {
    if (!state.raw.length) { showError('Daftar peserta masih kosong.'); return; }
    konfirmasi('Hapus semua peserta?',
      'Seluruh ' + state.raw.length + ' nama peserta akan dihapus. Hasil undian yang sudah ada tidak ikut terhapus.',
      'Ya, Hapus Semua', function () { setParticipants([], ''); });
  });

  el.chkDedupe.addEventListener('change', function () {
    state.dedupe = el.chkDedupe.checked;
    renderPeserta('');
    save();
  });

  el.pilihHadiah.addEventListener('change', function () { clearWarn(); refresh(); });
  el.jumlahUndi.addEventListener('input', clearWarn);
  el.jumlahUndi.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); mulaiUndian(); }
  });

  // hapus satu pemenang dari daftar Hasil Sementara
  el.riwayat.addEventListener('click', function (e) {
    // kirim / salin pemenang satu sesi
    const act = e.target.closest('.sesi-act');
    if (act) {
      const si = parseInt(act.dataset.s, 10);
      const ss = state.sesi[si];
      if (!ss) return;
      const judul = 'PENGUNDIAN KE-' + (ss.ronde || (si + 1));
      const teks = teksDaftar('🏆 PEMENANG UNDIAN', [{ judul: judul, winners: ss.winners }]);
      if (act.classList.contains('wa-sesi')) kirimWA(teks, 'waNoteRiwayat');
      else salinTeks(teks, 'waNoteRiwayat');
      return;
    }
    if (e.target.closest('#btnWaSemua')) { kirimWA(teksSemuaSesi(), 'waNoteRiwayat'); return; }
    if (e.target.closest('#btnSalinSemua')) { salinTeks(teksSemuaSesi(), 'waNoteRiwayat'); return; }

    const b = e.target.closest('.wx');
    if (!b) return;
    const si = parseInt(b.dataset.s, 10), wi = parseInt(b.dataset.w, 10);
    const sesi = state.sesi[si];
    if (!sesi || !sesi.winners[wi]) return;
    const nama = sesi.winners[wi].name;
    konfirmasi('Hapus pemenang?',
      '"' + nama + '" akan dihapus dari daftar pemenang ' + sesi.prize +
      ' dan namanya kembali masuk kotak undian.',
      'Ya, Hapus', function () {
        sesi.winners.splice(wi, 1);
        if (!sesi.winners.length) state.sesi.splice(si, 1);
        save();
        refresh();
      });
  });

  // kirim / salin pemenang satu hadiah dari halaman hasil akhir
  el.hasilAkhir.addEventListener('click', function (e) {
    const act = e.target.closest('.bh-act .sesi-act');
    if (!act) return;
    const h = rekapHadiah()[parseInt(act.dataset.h, 10)];
    if (!h) return;
    const teks = teksDaftar('🏆 PEMENANG UNDIAN', [h]);
    if (act.classList.contains('wa-sesi')) kirimWA(teks, 'waNote');
    else salinTeks(teks, 'waNote');
  });

  el.btnStart.addEventListener('click', mulaiUndian);
  el.btnStop.addEventListener('click', stopUndian);
  el.btnLagi.addEventListener('click', undiLagi);
  el.btnSelesai.addEventListener('click', pengundianSelesai);
  el.btnSelesaiBawah.addEventListener('click', pengundianSelesai);
  el.btnReset.addEventListener('click', resetSemua);

  el.btnSound.addEventListener('click', function () {
    const on = AudioFX.toggle();
    el.btnSound.textContent = on ? '🔊' : '🔇';
  });
  el.btnFull.addEventListener('click', function () {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  document.addEventListener('keydown', function (e) {
    const t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.phase === 'rolling') stopUndian();
      else if (state.phase === 'setup') mulaiUndian();
    }
  });

  // daftar peserta diubah dari jendela Kelola Peserta
  window.addEventListener('storage', function (e) {
    if (e.key !== LS_STATE) return;
    if (state.phase === 'rolling' || state.phase === 'stopping') return;
    let s = null;
    try { s = JSON.parse(e.newValue || 'null'); } catch (err) { return; }
    if (!s || !s.raw) return;
    state.raw = s.raw.map(function (p) {
      return {
        name: rapikanNama(p.name),
        g: p.g === 'P' ? 'P' : 'L',
        t: p.t === false ? false : true,
        u: p.u === false ? false : true,
        h: p.h === true,
        jam: typeof p.jam === 'string' ? p.jam : ''
      };
    });
    renderPeserta('diperbarui dari halaman lain');
    refresh();
  });

  // pasang data yang datang dari Store ke dalam state
  function pasangData(d) {
    state.raw = (d.raw || []).map(function (p) {
      return {
        name: rapikanNama(p.name),
        g: p.g === 'P' ? 'P' : 'L',
        t: p.t === false ? false : true,
        u: p.u === false ? false : true,
        h: p.h === true,
        jam: typeof p.jam === 'string' ? p.jam : ''
      };
    });
    state.dedupe = !!d.dedupe;
    if (Array.isArray(d.hadiah) && d.hadiah.length) state.hadiah = d.hadiah.slice();
    state.sesi = bacaSesi(d.sesi);
    if (Array.isArray(d.rencana) && d.rencana.length) state.rencana = salinRencana(d.rencana);
    applyDedupe();
  }

  function gambarUlangSemua(label) {
    el.chkDedupe.checked = state.dedupe;
    renderHadiah();
    renderPeserta(label);
    refresh();
  }

  /* ---------- INIT ---------- */
  if (!state.rencana.length) state.rencana = salinRencana(RENCANA_BAWAAN);

  if (window.Store) {
    // jangan tarik perubahan dari perangkat lain saat roll sedang berjalan
    Store.tundaSaat(function () {
      return state.phase === 'rolling' || state.phase === 'stopping';
    });
    Store.dengar(function (d) {
      pasangData(d);
      if (!state.rencana.length) state.rencana = salinRencana(RENCANA_BAWAAN);
      gambarUlangSemua('diperbarui dari perangkat lain');
    });
    load();                       // tampilkan cadangan lokal lebih dulu
    gambarUlangSemua(state.raw.length ? 'data tersimpan' : '');
    Store.muat(function (d, mode) {
      pasangData(d);
      if (!state.rencana.length) state.rencana = salinRencana(RENCANA_BAWAAN);
      gambarUlangSemua(state.raw.length
        ? (mode === 'server' ? 'data bersama (server)' : 'data tersimpan')
        : '');
    });
  } else {
    load();
    gambarUlangSemua(state.raw.length ? 'data tersimpan' : '');
  }
})();
