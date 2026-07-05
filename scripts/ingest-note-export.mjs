// note公式エクスポート(WXR形式ZIP)からサイトコンテンツを再生成するスクリプト
//
// 使い方:
//   node scripts/ingest-note-export.mjs <WXRエクスポートzipのパス>
//   (npm run ingest -- <zipのパス> でも可)
//
// 処理内容:
//   1. ZIP内のWXR XML(note-*.xml)から全記事(<item>)を抽出
//   2. wp:status が publish のもののみ対象(下書き除外)
//   3. data/paid-articles.txt のタイトルと正規化比較して有料記事を除外
//   4. note側の二重エスケープ(&amp; が文字列として残るバグ)を正規化
//   5. 本文中の画像参照をZIP内の実ファイルと突き合わせ、圧縮して src/assets/notes/ に配置
//   6. 記事ごとに src/content/articles/{id}.json を出力
//
// ギャラリー判定: タイトルに GALLERY_KEYWORDS のいずれかを含む記事

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import sharp from 'sharp';

const GALLERY_KEYWORDS = [
  'AIイラスト',
  'AIアート',
  'SeaArt',
  '画像生成AI',
  'AI画像生成',
  'OASOBI企画',
  'Nanobanana',
  'NanoBanana',
];

const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 80;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(rootDir, 'src', 'content', 'articles');
const imagesDir = path.join(rootDir, 'src', 'assets', 'notes');
const paidListPath = path.join(rootDir, 'data', 'paid-articles.txt');

// ---- ユーティリティ ----

// HTMLエンティティを1回だけ復号する(html.unescape() 相当)
function decodeEntitiesOnce(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// タイトル比較用の正規化: エンティティを安定するまで復号 → NFKC → 空白統一 → trim
function normalizeTitle(str) {
  let s = str;
  for (let i = 0; i < 5; i++) {
    const decoded = decodeEntitiesOnce(s);
    if (decoded === s) break;
    s = decoded;
  }
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function isGalleryArticle(title) {
  return GALLERY_KEYWORDS.some((kw) => title.includes(kw));
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// ---- メイン ----

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('使い方: node scripts/ingest-note-export.mjs <WXRエクスポートzipのパス>');
  process.exit(1);
}
if (!fs.existsSync(zipPath)) {
  console.error(`zipファイルが見つかりません: ${zipPath}`);
  process.exit(1);
}

// 有料記事リスト読み込み
const paidTitles = fs
  .readFileSync(paidListPath, 'utf-8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map(normalizeTitle);
const paidTitleSet = new Set(paidTitles);
const matchedPaidTitles = new Set();

// ZIP読み込み
const zip = new AdmZip(zipPath);
const xmlEntry = zip.getEntries().find((e) => /\.xml$/i.test(e.entryName) && !e.isDirectory);
if (!xmlEntry) {
  console.error('ZIP内にWXR XMLファイルが見つかりません');
  process.exit(1);
}
console.log(`WXR XML: ${xmlEntry.entryName}`);

// ZIP内の画像を entryName(basename) で引けるように索引化
const assetEntries = new Map();
for (const entry of zip.getEntries()) {
  if (entry.isDirectory) continue;
  const m = entry.entryName.match(/^assets\/(.+)$/);
  if (m) assetEntries.set(m[1], entry);
}
console.log(`ZIP内画像: ${assetEntries.size}件`);

// XMLパース(CDATA内の文字列はそのまま保持される)
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  processEntities: true,
});
const doc = parser.parse(xmlEntry.getData().toString('utf-8'));
const items = toArray(doc?.rss?.channel?.item);
console.log(`記事総数: ${items.length}件`);

// 出力先をクリーンに再生成
fs.rmSync(contentDir, { recursive: true, force: true });
fs.rmSync(imagesDir, { recursive: true, force: true });
fs.mkdirSync(contentDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });

const stats = {
  total: items.length,
  drafts: 0,
  paid: [],
  published: 0,
  gallery: 0,
  imagesResolved: 0,
  imagesMissing: [],
};

for (const item of items) {
  const status = String(item['wp:status'] ?? '');
  if (status !== 'publish') {
    stats.drafts++;
    continue;
  }

  const id = String(item.guid ?? '').trim();
  const rawTitle = String(item.title ?? '');
  // note側の二重エスケープバグ対策: タイトルはエンティティを1回復号
  const title = decodeEntitiesOnce(rawTitle);

  if (paidTitleSet.has(normalizeTitle(rawTitle))) {
    matchedPaidTitles.add(normalizeTitle(rawTitle));
    stats.paid.push(title);
    continue;
  }

  if (!id) {
    console.warn(`警告: guidが空の記事をスキップ: ${title}`);
    continue;
  }

  // 本文: 二重エスケープされた & のみ復元(正当なエンティティは壊さない)
  let html = String(item['content:encoded'] ?? '').replace(/&amp;amp;/g, '&amp;');

  const postDate = String(item['wp:post_date'] ?? ''); // YYYY-MM-DD HH:mm:ss
  const date = postDate.slice(0, 10);
  const noteUrl = String(item.link ?? '');

  // 本文中の画像参照を実ファイルと突き合わせて圧縮・配置
  const srcRefs = [...html.matchAll(/<img\b[^>]*?src="\/assets\/([^"]+)"/g)].map((m) => m[1]);
  const images = [];
  for (const ref of [...new Set(srcRefs)]) {
    const entry = assetEntries.get(ref);
    if (!entry) {
      stats.imagesMissing.push(`${id}: ${ref}`);
      continue;
    }
    const ext = path.extname(ref).toLowerCase();
    let outName;
    if (ext === '.gif') {
      // GIFはアニメーション保持のため無変換でコピー
      outName = ref;
      fs.writeFileSync(path.join(imagesDir, outName), entry.getData());
    } else {
      outName = ref.replace(/\.[^.]+$/, '.jpg');
      const buffer = await sharp(entry.getData())
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      fs.writeFileSync(path.join(imagesDir, outName), buffer);
    }
    images.push(outName);
    stats.imagesResolved++;
    // 本文の参照も配置後のファイル名に書き換える
    if (outName !== ref) {
      html = html.replaceAll(`/assets/${ref}`, `/assets/${outName}`);
    }
  }

  const gallery = isGalleryArticle(title);
  if (gallery) stats.gallery++;

  const record = { title, date, datetime: postDate, noteUrl, gallery, images, html };
  fs.writeFileSync(path.join(contentDir, `${id}.json`), JSON.stringify(record, null, 2));
  stats.published++;
}

// ---- サマリー ----

console.log('\n===== ingest サマリー =====');
console.log(`記事総数        : ${stats.total}件`);
console.log(`下書き(除外)    : ${stats.drafts}件`);
console.log(`有料記事(除外)  : ${stats.paid.length}件`);
for (const t of stats.paid) console.log(`  - ${t}`);
console.log(`サイト掲載      : ${stats.published}件`);
console.log(`ギャラリー対象  : ${stats.gallery}件`);
console.log(`画像解決        : ${stats.imagesResolved}件`);
if (stats.imagesMissing.length > 0) {
  console.warn(`画像未解決      : ${stats.imagesMissing.length}件`);
  for (const m of stats.imagesMissing) console.warn(`  - ${m}`);
}

// 除外リストのタイトルがWXR内に見つからなかった場合は警告(リストの誤記検知)
const unmatchedPaid = paidTitles.filter((t) => !matchedPaidTitles.has(t));
if (unmatchedPaid.length > 0) {
  console.warn('\n警告: 除外リストの以下のタイトルはWXR内のどの記事とも一致しませんでした:');
  for (const t of unmatchedPaid) console.warn(`  - ${t}`);
}
