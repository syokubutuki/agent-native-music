# 歌声の付け方(VOICEVOX)

## どこで動かすか
VOICEVOX はあなたのPCにあります(別のセッションの記録に、エンジンが `C:/Program Files/VOICEVOX/vv-engine/run.exe` にあると残っていました)。クラウドの私のセッションからは、あなたのPCのエンジンへつなげません。そこで、**あなたのPCで動かす小さなスクリプト**を用意しました。

- スクリプト: `tools/voicevox-sing.py`(標準ライブラリだけ。pip は不要)
- やること: 楽譜データ(`songs/*.json`)の歌のパートを、VOICEVOX のソング機能(`/sing_frame_audio_query` と `/frame_synthesis`)に送り、WAV を書き出す。
- 必要なもの: VOICEVOX の「ソング」機能が入った版(エンジン 0.20 以降)。

## 手順(あなたのPCで)
1. このリポジトリのブランチ `claude/wizardly-lamport-beecxt` を取る(`git clone` か `git pull`)。
2. VOICEVOX を起動する。
3. 歌えるキャラクターを調べる: `python tools/voicevox-sing.py --list`
4. 歌わせる: `python tools/voicevox-sing.py songs/sketch-j-utsuranai-v1.json --singer ずんだもん`
   - キャラクター名の一部を `--singer` に書く。自動で選べないときは `--query-speaker` と `--speaker` に id を書く(`--list` の出力から)。
   - 声が高すぎ・低すぎるときは `--transpose -12`(半音単位)。
   - 「合いの手」は `--track 1`。
   - エンジンが歌詞を受け付けないときは `--katakana`。
5. `dist/voicevox/…wav` ができる。試聴ページの「歌声を重ねる」でその WAV を選ぶ。

## あなたの他のセッションに頼むとき(貼り付け用)
> このPCで次を実行してください。
> 1. `https://github.com/syokubutuki/agent-native-music.git` を取得し、ブランチ `claude/wizardly-lamport-beecxt` に切り替えて最新にする。
> 2. VOICEVOX のエンジンを起動する。
> 3. `python tools/voicevox-sing.py --list` を実行して、歌えるキャラクターと style の一覧を教えてください。
> 4. 私が選んだキャラで `python tools/voicevox-sing.py songs/sketch-j-utsuranai-v1.json --singer <キャラ名>` と、続けて `--track 1` を実行し、できた WAV の場所を教えてください。
> エラーが出たら、文面をそのまま教えてください。

## 確認できていないこと・注意
- スクリプトは、擬似のエンジンに対する動作(楽譜の組み立て、通信の形)しか確かめていない(`npm run test:voicevox`)。**本物の VOICEVOX での動作は未確認**。エラーが出たら、その文面から直す。
- ソング用の style の種類名(`singing_teacher` / `frame_decode` / `sing`)は、エンジンの版で違うかもしれない。自動で選べなければ、一覧から id を指定する。
- 速いラップ(1小節16音)を VOICEVOX が歌いこなせるかは未確認。
- キャラクターごとの利用規約とクレジット表記(例: `VOICEVOX:キャラ名`)は、使う人が確認する。ボカコレの参加規約で VOICEVOX の歌声が認められるかも、公式の規約で確認すること(私は確認できていない)。
