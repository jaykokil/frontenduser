# Inventory Frontend Deploy Ready

React + Vite frontend for your inventory system.

## Run locally

```bash
npm install
npm run dev
```

## Connect backend

Create `.env` file:

```env
VITE_API_URL=https://your-render-backend-url.onrender.com/api
```

For local backend:

```env
VITE_API_URL=http://localhost:4000/api
```

## Login

```txt
skyline / 1234
```

## Deploy on Vercel

Build command:

```txt
npm run build
```

Output directory:

```txt
dist
```

Environment variable:

```env
VITE_API_URL=https://back-a9dq.onrender.com/api
```
