# AgentRam

Dashboard pantauan Freemint Agent ID dengan data API lokal, pencarian/filter, CRUD agent, chart, dan detail modal.

## Fitur
- Data berdasar API lokal di `http://localhost:3000/api/agents`
- Tambah, edit, dan hapus agent melalui form
- Pencarian dan filter status
- Chart distribusi status dan trust score
- Detail informasi lengkap per agent
- Export data JSON

## Jalankan project
1. Jalankan backend API:

```bash
npm install
npm start
```

2. Jalankan frontend static server di folder repo yang sama:

```bash
python -m http.server 8000
```

3. Buka browser:

```text
http://localhost:8000
```

## API endpoint
- GET `http://localhost:3000/api/agents`
- POST `http://localhost:3000/api/agents`
- PUT `http://localhost:3000/api/agents`
- DELETE `http://localhost:3000/api/agents?id=FA-1024`

## Catatan
API saat ini berjalan di lokal dan menyimpan data ke file `data/agents.json` di folder backend repo. Untuk production, perlu diarahkan ke database/API yang terhosting.
