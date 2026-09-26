<?php
/**
 * Penyimpan data bersama untuk aplikasi undian.
 *
 * Semua data disimpan dalam satu berkas JSON di server, jadi beberapa
 * perangkat (mis. HP untuk absensi + laptop untuk undian) membaca dan
 * menulis data yang sama.
 *
 *   GET  api.php            -> seluruh data
 *   GET  api.php?rev=12     -> {"unchanged":true} bila belum ada perubahan
 *   POST api.php            -> {"bagian":{...}} atau {"op":"...", ...}
 *
 * Penulisan memakai kunci berkas (flock) supaya dua perangkat yang menyimpan
 * bersamaan tidak saling merusak data.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

define('DIR_DATA', __DIR__ . '/data');
define('BERKAS', DIR_DATA . '/state.json');

/** Bagian data yang boleh ditulis klien. */
function bagianSah() {
    return array('raw', 'dedupe', 'hadiah', 'sesi', 'tim');
}

function dataKosong() {
    return array(
        'rev'     => 0,
        'savedAt' => 0,
        'raw'     => array(),   // daftar peserta: name, g, t, u, h, jam
        'dedupe'  => false,
        'hadiah'  => array(),
        'sesi'    => array(),   // hasil undian per sesi
        'tim'     => array()    // hasil pembagian tim
    );
}

function balas($data, $kode = 200) {
    http_response_code($kode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function siapkanFolder() {
    if (!is_dir(DIR_DATA) && !@mkdir(DIR_DATA, 0777, true) && !is_dir(DIR_DATA)) {
        balas(array('error' => 'Folder data tidak bisa dibuat. Periksa izin tulis.'), 500);
    }
}

/** Buka berkas terkunci, lalu jalankan $kerja($data). Kembalikan data akhir. */
function denganKunci($eksklusif, $kerja) {
    siapkanFolder();
    $fh = @fopen(BERKAS, 'c+');
    if (!$fh) {
        balas(array('error' => 'Berkas data tidak bisa dibuka.'), 500);
    }
    if (!flock($fh, $eksklusif ? LOCK_EX : LOCK_SH)) {
        fclose($fh);
        balas(array('error' => 'Berkas data sedang dipakai, coba lagi.'), 503);
    }

    $isi = stream_get_contents($fh);
    $data = strlen($isi) ? json_decode($isi, true) : null;
    if (!is_array($data)) $data = dataKosong();
    $data = array_merge(dataKosong(), $data);

    $hasil = $kerja($data);

    if ($eksklusif && is_array($hasil)) {
        $hasil['rev'] = intval($data['rev']) + 1;
        $hasil['savedAt'] = round(microtime(true) * 1000);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($hasil, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($fh);
        $data = $hasil;
    }

    flock($fh, LOCK_UN);
    fclose($fh);
    return $data;
}

/* ---------------------------------------------------------------- BACA */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $revKlien = isset($_GET['rev']) ? intval($_GET['rev']) : -1;
    $data = denganKunci(false, function ($d) { return null; });
    if ($revKlien >= 0 && intval($data['rev']) === $revKlien) {
        balas(array('unchanged' => true, 'rev' => intval($data['rev'])));
    }
    balas($data);
}

/* ---------------------------------------------------------------- TULIS */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    balas(array('error' => 'Metode tidak didukung.'), 405);
}

$mentah = file_get_contents('php://input');
$minta = json_decode($mentah, true);
if (!is_array($minta)) {
    balas(array('error' => 'Isi permintaan bukan JSON yang sah.'), 400);
}

$hasil = denganKunci(true, function ($d) use ($minta) {

    /* --- operasi bertarget: aman dipakai beberapa perangkat sekaligus --- */
    if (isset($minta['op'])) {
        $op = $minta['op'];

        // tandai hadir / tidak hadir berdasarkan nama
        if ($op === 'hadir') {
            $nama = isset($minta['nama']) ? (string)$minta['nama'] : '';
            $h    = !empty($minta['h']);
            $jam  = isset($minta['jam']) ? (string)$minta['jam'] : '';
            foreach ($d['raw'] as $i => $p) {
                if (isset($p['name']) && $p['name'] === $nama) {
                    $d['raw'][$i]['h'] = $h;
                    $d['raw'][$i]['jam'] = $h ? $jam : '';
                    break;
                }
            }
            return $d;
        }

        // tambah satu peserta di ujung daftar
        if ($op === 'tambah' && isset($minta['peserta']) && is_array($minta['peserta'])) {
            $p = $minta['peserta'];
            $d['raw'][] = array(
                'name' => isset($p['name']) ? (string)$p['name'] : '',
                'g'    => (isset($p['g']) && $p['g'] === 'P') ? 'P' : 'L',
                't'    => !isset($p['t']) || $p['t'] !== false,
                'u'    => !isset($p['u']) || $p['u'] !== false,
                'h'    => isset($p['h']) && $p['h'] === true,
                'jam'  => isset($p['jam']) ? (string)$p['jam'] : ''
            );
            return $d;
        }

        // kosongkan seluruh data (tombol reset)
        if ($op === 'reset') {
            return dataKosong();
        }

        return $d;
    }

    /* --- tulis per bagian: halaman lain hanya mengganti bagian miliknya --- */
    if (isset($minta['bagian']) && is_array($minta['bagian'])) {
        foreach ($minta['bagian'] as $nama => $nilai) {
            if (in_array($nama, bagianSah(), true)) {
                $d[$nama] = $nilai;
            }
        }
        return $d;
    }

    return $d;
});

balas($hasil);
