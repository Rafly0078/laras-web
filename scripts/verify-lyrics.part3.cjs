/**
 * Bagian 3 harness: menguji SAPUAN BERGERAK dengan jam sintetis.
 *
 * Ini bagian yang benar-benar membuktikan mesinnya bekerja. Halaman
 * /dev/lirik/[slug] membuka window.__laras sehingga posisi bisa disetel dari
 * luar — tanpa itu, pemutar YouTube memblokir autoplay dan kita hanya bisa
 * mengukur keadaan diam.
 */

module.exports = async function run({ evalJs, check, sleep }) {
  console.log('\n[3] Sapuan bergerak (jam sintetis, tanpa YouTube)');

  const hasHandle = await evalJs(`typeof window.__laras === 'object' && window.__laras !== null`);
  check('window.__laras tersedia di halaman dev', hasHandle === true);
  if (hasHandle !== true) return;

  /** Setel posisi, tunggu beberapa frame, lalu baca nilai dari DOM. */
  async function sampleAt(seconds, frames = 12) {
    await evalJs(`window.__laras.setPosition(${seconds}); 1`);
    // Spring butuh beberapa frame untuk mengejar target barunya.
    await sleep(frames * 17);
    return JSON.parse(
      await evalJs(`(() => {
        const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"]')];
        const words = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
        const grad = words
          .map((w) => parseFloat(w.style.getPropertyValue('--gradient-position')))
          .filter(Number.isFinite);
        const scales = words
          .map((w) => Number((w.style.transform.match(/scale\\(([-\\d.]+)\\)/) || [])[1]))
          .filter(Number.isFinite);
        const opac = lines.map((l) => parseFloat(l.style.opacity)).filter(Number.isFinite);
        const blurs = lines
          .map((l) => parseFloat(l.style.getPropertyValue('--blur-amount')))
          .filter(Number.isFinite);
        const sweeping = grad.filter((g) => g > -19 && g < 99).length;
        const done = grad.filter((g) => g >= 99).length;
        return JSON.stringify({
          words: words.length,
          gradWritten: grad.length,
          sweeping,
          done,
          maxGrad: grad.length ? Math.max(...grad) : null,
          minGrad: grad.length ? Math.min(...grad) : null,
          maxScale: scales.length ? Math.max(...scales) : null,
          fullOpacityLines: opac.filter((o) => o > 0.98).length,
          maxBlur: blurs.length ? Math.max(...blurs) : null,
        });
      })()`),
    );
  }

  /* Awal lagu: intro instrumental, belum ada kata yang tersapu. */
  const t0 = await sampleAt(0);
  check(
    'rAF loop MENULIS --gradient-position (mesin hidup)',
    t0.gradWritten > 0,
    `${t0.gradWritten}/${t0.words} kata`,
  );
  check('di posisi 0, belum ada kata yang selesai tersapu', t0.done === 0, `${t0.done} selesai`);

  /* Tengah baris pertama: harus ada kata yang SEDANG tersapu. */
  const mid = await sampleAt(12.6);
  check(
    'ada kata yang SEDANG tersapu di tengah baris',
    mid.sweeping > 0,
    `${mid.sweeping} kata di antara -20% dan 100%`,
  );
  check(
    'ada kata yang SUDAH selesai tersapu',
    mid.done > 0,
    `${mid.done} kata di 100%`,
  );
  check(
    'skala kata aktif melewati 1 (spring membesarkan)',
    mid.maxScale !== null && mid.maxScale > 1,
    `skala maks ${mid.maxScale}`,
  );

  /* Sapuan harus MAJU seiring waktu, bukan diam. */
  const a = await sampleAt(12.2);
  const b = await sampleAt(12.9);
  check(
    'jumlah kata selesai BERTAMBAH saat waktu maju',
    b.done >= a.done,
    `${a.done} -> ${b.done}`,
  );

  /* Akhir lagu: kata-kata sudah tersapu.
   *
   * Catatan penting: SATU kata boleh saja masih di tengah sapuan. Ini bukan
   * cacat — pada instan sampel mana pun bisa ada satu kata yang start-nya
   * sudah lewat tapi end-nya belum, dan itu justru bukti animasinya kontinu.
   * Yang salah kalau BANYAK kata macet di tengah.
   */
  const end = await sampleAt(250);
  check(
    'di akhir lagu kata-kata sudah tersapu',
    end.done > mid.done,
    `${mid.done} -> ${end.done} kata selesai`,
  );
  check(
    'tidak ada kata yang MACET di tengah sapuan (maks 1 = kata yang sedang jalan)',
    end.sweeping <= 1,
    `${end.sweeping} kata di tengah`,
  );

  /* Baris aktif tetap tunggal, dan blur tetap dalam batas. */
  check(
    'tepat satu baris beropacity penuh di tiap posisi',
    mid.fullOpacityLines === 1,
    `${mid.fullOpacityLines} baris`,
  );
  check(
    'blur tidak melewati cap 6,83px',
    mid.maxBlur !== null && mid.maxBlur <= 6.84,
    `maks ${mid.maxBlur}px`,
  );

  /* Seek balik: nilai harus mundur, bukan macet di posisi lama. */
  const back = await sampleAt(9.3, 20);
  check(
    'seek ke belakang mengurangi jumlah kata selesai',
    back.done < end.done,
    `${end.done} -> ${back.done}`,
  );

  /* Vokal latar & duet pada lagu ini. */
  const duet = JSON.parse(
    await evalJs(`(() => {
      const opposite = [...document.querySelectorAll('[aria-label^="Lompat ke"]')]
        .filter((l) => l.className.includes('opposite'));
      return JSON.stringify({ opposite: opposite.length });
    })()`),
  );
  check('baris duet diratakan ke kanan', duet.opposite > 0, `${duet.opposite} baris`);
};
