#!/usr/bin/env bash
# Start the local VOICEVOX engine if it is not already answering. Engine files are expected under
# $VOICEVOX_HOME (default /home/user/voicevox/rootfs/opt/voicevox_engine) — see specs/song-zenbu-choudai.md
# for how they were obtained (official Docker Hub image, extracted without Docker).
set -euo pipefail
URL="${VOICEVOX_URL:-http://127.0.0.1:50021}"
HOME_DIR="${VOICEVOX_HOME:-/home/user/voicevox/rootfs/opt/voicevox_engine}"
if curl -s -o /dev/null "$URL/version"; then echo "voicevox: running ($(curl -s "$URL/version"))"; exit 0; fi
[ -x "$HOME_DIR/run" ] || { echo "voicevox: engine not found at $HOME_DIR" >&2; exit 1; }
(cd "$HOME_DIR" && nohup ./run --host 127.0.0.1 --port 50021 > "${HOME_DIR%/rootfs/*}/engine.log" 2>&1 &)
for _ in $(seq 1 60); do curl -s -o /dev/null "$URL/version" && { echo "voicevox: started ($(curl -s "$URL/version"))"; exit 0; }; sleep 2; done
echo "voicevox: did not come up" >&2; exit 1
