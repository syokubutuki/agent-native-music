#!/usr/bin/env bash
# Install the VOICEVOX engine without Docker: fetch the official Docker Hub image (voicevox/voicevox_engine)
# through Google's public Docker Hub mirror (Docker Hub itself rate-limits anonymous pulls from shared IPs,
# and GitHub release assets are not reachable from cloud sessions), verify the layer digest, and extract
# /opt/voicevox_engine. Then start it with scripts/voicevox-up.sh.
set -euo pipefail
TAG="${VOICEVOX_TAG:-cpu-ubuntu22.04-0.25.2}"
DEST="${VOICEVOX_ROOT:-/home/user/voicevox}"
REG="https://mirror.gcr.io/v2/voicevox/voicevox_engine"
ACCEPT="Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json"

if [ -x "$DEST/rootfs/opt/voicevox_engine/run" ]; then echo "voicevox: already installed at $DEST"; exit 0; fi
mkdir -p "$DEST/dl" "$DEST/rootfs"
digest=$(curl -sSL -H "$ACCEPT" "$REG/manifests/$TAG" | python3 -c 'import sys,json; m=json.load(sys.stdin)["manifests"]; print([x["digest"] for x in m if x["platform"]["architecture"]=="amd64"][0])')
layers=$(curl -sSL -H "$ACCEPT" "$REG/manifests/$digest" | python3 -c 'import sys,json; [print(l["digest"], l["size"]) for l in json.load(sys.stdin)["layers"]]')
echo "$layers" | while read -r d size; do
  f="$DEST/dl/${d#sha256:}.tgz"
  echo "voicevox: layer ${d:7:12} ($((size / 1048576)) MB)"
  curl -sSL --retry 3 -o "$f" "$REG/blobs/$d"
  echo "${d#sha256:}  $f" | sha256sum -c --quiet
  # only the layers that carry the engine matter; extracting them all is harmless
  tar -xzf "$f" -C "$DEST/rootfs" --wildcards 'opt/*' 2>/dev/null || true
done
rm -rf "$DEST/dl"
[ -x "$DEST/rootfs/opt/voicevox_engine/run" ] || { echo "voicevox: engine binary not found after extract" >&2; exit 1; }
echo "voicevox: installed $TAG at $DEST/rootfs/opt/voicevox_engine"
