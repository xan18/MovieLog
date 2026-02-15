# Movie.Log v27 (Project)

Это тот же **Movie.Log v27 Enhanced**, но разложенный как обычный проект (Vite + React), без «всё в одном HTML».

## Запуск

1) Установи Node.js (лучше LTS)
2) В папке проекта:

```bash
npm install
npm run dev
```

Откроется адрес из консоли (обычно `http://localhost:5173`).

## Сборка

```bash
npm run build
npm run preview
```

## Важно

- Tailwind подключён через CDN в `index.html`, чтобы визуал совпал 1-в-1.
- Данные библиотеки хранятся в `localStorage` под ключом `movie_log_v27`.

## Environment

Create a `.env` file from `.env.example` and set:

```bash
VITE_TMDB_API_KEY=your_tmdb_api_key_here
```
