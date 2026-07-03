# myresumes

Nuxt + Prisma resume tracker project.

## Setup

```bash
npm install
```

If you're using a fresh local database, the resume API will initialize the Prisma schema automatically on first use.

## Run

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Typecheck/Test

```bash
npm run lint
npm test
```

## Prisma

```bash
npm run prisma:migrate
npm run prisma:generate
```

To apply migrations manually against the local SQLite database, run:

```bash
npx prisma migrate deploy
```
