/**
 * ShelfRow — satu rak horizontal di Home, ala "Listen Now" Apple Music.
 *
 * Server component: rak hanya menata judul dan sebuah kontainer yang bisa
 * digulir. Tidak ada state maupun handler di sini, jadi tidak perlu dikirim
 * sebagai JavaScript ke browser. Interaksi (kartu yang diklik) menjadi urusan
 * masing-masing anak.
 */

export interface ShelfRowProps {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}

export function ShelfRow({ title, subtitle, children }: ShelfRowProps) {
  return (
    <section className="py-4">
      <header className="flex items-baseline justify-between px-6 pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
          {subtitle ? <p className="text-sm text-laras-secondary">{subtitle}</p> : null}
        </div>
        {/* <span>, bukan <button>: komponen ini server-side sehingga tidak boleh
            membawa onClick. Dibuat sebagai teks dulu supaya tampilannya sudah
            final; kelak dinaikkan menjadi Link saat rute daftar penuh ada. */}
        <span className="shrink-0 text-sm font-medium text-laras-accent hover:underline">
          Lihat Semua
        </span>
      </header>

      {/* snap-x + snap-mandatory: gulir berhenti rapi di tepi kartu, seperti rak
          Apple Music. `no-scrollbar` menyembunyikan scrollbar horizontal karena
          rak Apple Music tidak pernah menampilkannya — bilah abu-abu di bawah
          artwork langsung membuat halaman terasa seperti halaman web biasa.
          Anak-anak dirender apa adanya (lebarnya tetap dan ditentukan sendiri);
          membungkusnya di sini akan merusak snap point mereka. */}
      <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2">
        {children}
      </div>
    </section>
  );
}
