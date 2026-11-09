# Wii Sports 打撃フォーム分析ダッシュボード

公開URL: https://hangfzuoyain-hash.github.io/wii-baseball/

- `index.html` … 画面の骨組み
- `style.css` … 見た目
- `app.js` … 計算・保存の処理（式は CLAUDE.md 参照）

打席データはリポジトリには入っていません。各ブラウザの localStorage（`wii_final` / `wii_final_f`）に保存されます。
端末やブラウザを変えるときは「データ」タブでJSONを書き出し → 新しい方で読み込み。

## コードを更新して公開し直す
```bash
cd ~/Desktop/wii-baseball
git add -A
git commit -m "変更内容のメモ"
git push
```
1〜2分でサイトに反映されます。
