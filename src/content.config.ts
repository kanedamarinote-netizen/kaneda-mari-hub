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
    // 編集者の査読コメント(赤入れ)。段落インデックス(0始まり)に紐づく。
    // 現時点では全記事とも空配列。将来コメントが用意でき次第、記事JSONに追記する。
    reviewMarks: z
      .array(z.object({ afterParagraph: z.number(), text: z.string() }))
      .default([]),
  }),
});

export const collections = { articles };
