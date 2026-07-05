# 金田まりハブサイト

note公開記事のバックアップ・再掲載サイト。[Astro](https://astro.build/) 製の静的サイトで、GitHub Pagesでホスティングしています。

公開URL: https://kanedamarinote-netizen.github.io/kaneda-mari-hub/

## 構成

- `/`(index) — プロフィール(ヘッダー画像+自己紹介+リンク集)
- `/archive.html` — 無料記事アーカイブ
- `/gallery.html` — イラストギャラリー(記事単位でグループ化、クリックで拡大)
- `/articles/n{記事ID}.html` — 記事個別ページ

## サイトの更新方法(noteの記事を反映する)

1. noteの設定 → エクスポート機能で WXR形式のZIP をダウンロードする
2. 取り込みスクリプトを実行する:

   ```
   npm run ingest -- <ダウンロードしたzipのパス>
   ```

   - 公開記事(`wp:status=publish`)のみが対象になります(下書きは自動で除外)
   - **有料記事は `data/paid-articles.txt` のタイトルリストで除外されます。**
     新しく有料記事を公開したら、このファイルにタイトルを1行追加してください。
   - 実行後にサマリーが表示されます。「有料記事(除外)」の一覧に想定した記事が
     全部入っているか、毎回確認してください。
3. ローカルで確認する:

   ```
   npm run build
   npm run preview
   ```

4. 問題なければコミットして main に push すると、GitHub Actions が自動でビルド・デプロイします。

## 開発

```
npm install       # 初回のみ
npm run dev       # 開発サーバー
npm run build     # 本番ビルド (dist/ に出力)
npm run preview   # ビルド結果のプレビュー
```

## ディレクトリ

| パス | 内容 |
| --- | --- |
| `src/pages/` | 各ページ(index / archive / gallery / articles/[id]) |
| `src/content/articles/` | ingestが生成する記事データ(JSON)。手で編集しない |
| `src/assets/notes/` | ingestが配置する記事画像。手で編集しない |
| `src/assets/header-hero.jpg` | トップのヘッダー画像 |
| `data/paid-articles.txt` | 有料記事タイトルの除外リスト(手動管理) |
| `scripts/ingest-note-export.mjs` | WXR取り込みスクリプト |
| `.github/workflows/deploy.yml` | GitHub Pagesへの自動デプロイ |
