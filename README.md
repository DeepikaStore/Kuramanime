# Kuramanime Unofficial API

Node.js + Express HTML parser untuk `https://v20.kuramanime.ing/`. Disiapkan untuk deploy ke Vercel (serverless) atau VPS/Docker.

> **Status verifikasi:** lingkungan pembuatan ini tidak dapat mengakses internet/DNS, sehingga domain, struktur HTML, pola URL pencarian, dan selector belum dapat diuji live. Ini bukan API resmi. Situs dapat mengubah struktur halaman atau membatasi request. Jangan anggap endpoint berfungsi sebelum dites setelah deploy.

## Endpoint
- `GET /` — informasi API
- `GET /health` — health check
- `GET /api/home` — parse kartu dari halaman utama
- `GET /api/latest?page=2` — percobaan daftar halaman
- `GET /api/search?q=naruto` — pencarian (pola default `/search?search=...`, mungkin perlu disesuaikan)
- `GET /api/anime?url=https%3A%2F%2Fv20.kuramanime.ing%2F...` — detail anime
- `GET /api/episode?url=...` — detail episode dan URL sumber video yang tertanam di HTML

Parameter `url` dibatasi ke domain `KURAMA_BASE_URL` untuk menghindari SSRF.

## Deploy ke Vercel
1. Upload seluruh isi ZIP ini ke repository GitHub.
2. Import repository di Vercel.
3. Framework preset: Other; Build command kosong; Output directory kosong.
4. Deploy. Tes `/health`, lalu `/api/home`.

## Deploy VPS / Docker
```bash
npm install
npm start
```
Atau:
```bash
docker build -t kuramanime-api .
docker run -d --name kuramanime-api -p 3000:3000 --restart unless-stopped kuramanime-api
```

## Konfigurasi
Salin `.env.example` menjadi `.env`, lalu ubah bila diperlukan. Pada Vercel, masukkan variabel di Project Settings > Environment Variables.

## Contoh
```bash
curl "http://localhost:3000/api/search?q=naruto"
curl "http://localhost:3000/api/anime?url=https%3A%2F%2Fv20.kuramanime.ing%2F"
```

## Catatan teknis
- Parser memakai selector generik karena HTML live belum diperiksa.
- Jika pencarian situs memakai path lain, ubah `const path` pada route `/api/search`.
- Jika situs merender konten lewat JavaScript, membutuhkan browser automation atau endpoint internal yang diizinkan; parser HTML biasa mungkin tidak menemukan data.
- Hormati ketentuan penggunaan situs, hak cipta, robots policy, dan batas request. API ini tidak meng-host atau menyimpan video.
