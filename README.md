# AgentRam

Dashboard pantauan Freemint Agent ID dengan data JSON, pencarian/filter, dan CRUD agent di browser.

## Fitur
- Data awal dimuat dari `agents.json`.
- Tambah, edit, dan hapus agent lewat form.
- Perubahan disimpan di `localStorage` browser, sehingga tetap ada saat halaman dimuat ulang di browser yang sama.
- Ekspor data yang sedang aktif ke file `agents.json`.
- Pencarian, filter status, dan ringkasan statistik.

> Data di `agents.json` adalah data contoh/dummy, bukan data real-time atau daftar resmi.

## Menjalankan
Karena browser membatasi `fetch()` dari file lokal, jalankan melalui server lokal:

```bash
python -m http.server 8000
```

Buka http://localhost:8000.

## Catatan penyimpanan
CRUD saat ini hanya tersimpan di browser/perangkat yang digunakan. Tombol **Export JSON** mengunduh salinan terbaru; untuk membagikan perubahan ke semua pengguna atau menyimpannya secara permanen di server, perlu backend/API atau proses commit ke repositori.
