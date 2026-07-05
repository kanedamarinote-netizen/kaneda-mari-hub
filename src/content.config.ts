import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// scripts/ingest-note-export.mjs が生成する記事JSON
const articles = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    date: z.string(), // YYYY-MM-DD (表示用)
    datetime: z.string(), // YYYY-MM-DD HH:mm:ss (ソート用)
    noteUrl: z.string().url(),
    gallery: z.boolean(),
    images: z.array(z.string()),
    html: z.string(),
  }),
});

export const collections = { articles };
