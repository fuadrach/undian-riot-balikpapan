/* =========================================================================
   Store — satu pintu untuk data aplikasi undian.

   Dua mode, dipilih otomatis saat halaman dibuka:

   • "server"  : ada api.php (XAMPP). Data disimpan di berkas JSON di server,
                 jadi beberapa perangkat memakai data yang sama. Perubahan
                 dari perangkat lain ikut masuk lewat pemantauan berkala.
   • "lokal"   : api.php tidak ada (mis. GitHub Pages) atau server mati.
                 Data disimpan di localStorage seperti sebelumnya —
                 satu perangkat, satu browser.

   localStorage tetap ditulis pada mode server sebagai cadangan, supaya
   aplikasi masih bisa dipakai bila jaringan putus di tengah acara.
   ========================================================================= */
window.Store = (function () {
  'use strict';

  var KUNCI     = 'undian_riot_bpp_state_v2';
  var KUNCI_TIM = 'undian_riot_bpp_tim_v1';
  var API       = 'api.php';
  var JEDA_PANTAU = 2500;          // ms antar pemeriksaan perubahan

  var mode       = 'lokal';
  var rev        = -1;
  var pendengar  = [];
  var timerPantau = null;
  var pantauJalan = false;
  var bolehPantau = function () { return true; };   // halaman bisa menunda

  /* ------------------------------------------------------------ bantuan */
  function bacaLokal(kunci) {
    try { return JSON.parse(localStorage.getItem(kunci) || 'null'); }
    catch (e) { return null; }
  }
  function tulisLokal(kunci, nilai) {
    try { localStorage.setItem(kunci, JSON.stringify(nilai)); } catch (e) {}
  }

  function kosong() {
    return { raw: [], dedupe: false, hadiah: [], sesi: [], tim: [] };
  }

  // gabungkan bentuk lama (state + tim terpisah) jadi satu bentuk
  function dariLokal() {
    var s = bacaLokal(KUNCI) || {};
    var t = bacaLokal(KUNCI_TIM);
    return {
      raw:    s.raw    || [],
      dedupe: !!s.dedupe,
      hadiah: s.hadiah || [],
      sesi:   s.sesi   || [],
      tim:    (t && t.tim) ? t.tim : (s.tim || [])
    };
  }

  // tulis balik ke localStorage dalam bentuk lama, supaya tetap jadi cadangan
  function keLokal(d) {
    var s = bacaLokal(KUNCI) || {};
    s.raw = d.raw; s.dedupe = d.dedupe; s.hadiah = d.hadiah; s.sesi = d.sesi;
    s.savedAt = Date.now();
    tulisLokal(KUNCI, s);
    var t = bacaLokal(KUNCI_TIM) || {};
    t.tim = d.tim; t.savedAt = Date.now();
    tulisLokal(KUNCI_TIM, t);
  }

  function ambil(url, opsi) {
    if (!window.fetch) return Promise.reject(new Error('fetch tidak tersedia'));
    return fetch(url, opsi).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function beritahu(d, asal) {
    pendengar.forEach(function (fn) {
      try { fn(d, asal); } catch (e) {}
    });
  }

  /* ------------------------------------------------------------ pemantau */
  function periksa() {
    if (mode !== 'server' || pantauJalan || !bolehPantau()) return;
    pantauJalan = true;
    ambil(API + '?rev=' + rev + '&_=' + Date.now())
      .then(function (d) {
        if (!d.unchanged) {
          rev = d.rev;
          var bersih = {
            raw: d.raw || [], dedupe: !!d.dedupe, hadiah: d.hadiah || [],
            sesi: d.sesi || [], tim: d.tim || []
          };
          keLokal(bersih);
          beritahu(bersih, 'server');
        }
      })
      .catch(function () { /* jaringan putus sesaat: coba lagi nanti */ })
      .then(function () { pantauJalan = false; });
  }

  function mulaiPantau() {
    if (timerPantau || mode !== 'server') return;
    timerPantau = setInterval(periksa, JEDA_PANTAU);
    // periksa juga saat halaman kembali dibuka setelah HP dikunci
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') periksa();
    });
  }

  /* ------------------------------------------------------------ kirim ke server */
  function kirim(badan) {
    if (mode !== 'server') return Promise.resolve(null);
    return ambil(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badan)
    }).then(function (d) {
      if (d && typeof d.rev === 'number') rev = d.rev;
      return d;
    }).catch(function (e) {
      // biarkan gagal diam-diam: localStorage sudah menyimpan cadangannya
      return null;
    });
  }

  /* ------------------------------------------------------------ API publik */
  return {
    /** Muat data awal. Memanggil balik dengan (data, mode). */
    muat: function (selesai) {
      var cadangan = dariLokal();
      ambil(API + '?_=' + Date.now())
        .then(function (d) {
          mode = 'server';
          rev = typeof d.rev === 'number' ? d.rev : 0;
          var srv = {
            raw: d.raw || [], dedupe: !!d.dedupe, hadiah: d.hadiah || [],
            sesi: d.sesi || [], tim: d.tim || []
          };
          // server masih kosong tapi perangkat ini punya data -> naikkan
          if (!srv.raw.length && cadangan.raw.length) {
            kirim({ bagian: cadangan });
            srv = cadangan;
          }
          keLokal(srv);
          mulaiPantau();
          selesai(srv, mode);
        })
        .catch(function () {
          mode = 'lokal';
          selesai(cadangan, mode);
        });
    },

    /** Simpan sebagian data, mis. simpan({ raw: [...] }). */
    simpan: function (bagian) {
      var d = dariLokal();
      Object.keys(bagian).forEach(function (k) { d[k] = bagian[k]; });
      keLokal(d);
      return kirim({ bagian: bagian });
    },

    /** Tandai hadir/tidak per nama — aman dipakai beberapa perangkat sekaligus. */
    tandaiHadir: function (nama, hadir, jam) {
      var d = dariLokal();
      for (var i = 0; i < d.raw.length; i++) {
        if (d.raw[i].name === nama) {
          d.raw[i].h = !!hadir;
          d.raw[i].jam = hadir ? (jam || '') : '';
          break;
        }
      }
      keLokal(d);
      return kirim({ op: 'hadir', nama: nama, h: !!hadir, jam: jam || '' });
    },

    /** Tambah satu peserta tanpa menimpa perubahan perangkat lain. */
    tambahPeserta: function (peserta) {
      var d = dariLokal();
      d.raw.push(peserta);
      keLokal(d);
      return kirim({ op: 'tambah', peserta: peserta });
    },

    /** Kosongkan seluruh data di server. */
    reset: function () {
      keLokal(kosong());
      return kirim({ op: 'reset' });
    },

    /** Dengarkan perubahan dari perangkat lain. */
    dengar: function (fn) { pendengar.push(fn); },

    /** Halaman bisa menahan pemantauan, mis. saat roll undian berjalan. */
    tundaSaat: function (fn) { bolehPantau = function () { return !fn(); }; },

    /** Paksa periksa sekarang. */
    periksa: periksa,

    mode: function () { return mode; },
    rev:  function () { return rev; }
  };
})();
