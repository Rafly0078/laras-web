/** Opsi permintaan ke relay katalog. */
export interface AppleFetchOptions {
  /** Masa hidup cache Next (detik). */
  revalidate: number;
  /** Tag cache supaya bisa di-invalidate selektif nanti. */
  tags?: string[];
  /**
   * true untuk endpoint yang memang lambat (lirik cold ~11 detik), sehingga
   * batas waktunya dilonggarkan. Jangan dipakai untuk endpoint biasa —
   * permintaan menggantung 25 detik menahan render tanpa guna.
   */
  slow?: boolean;
}
