#!/bin/bash
# One-time setup for the depth camera (Orbbec Astra via OpenNI2). Expects conda.
#   bash tools/setup_depth.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REDIST="$HERE/../../camera_tests/openni2_redist"
ENV_NAME=depth_cam

if ! command -v conda >/dev/null; then echo "conda not found. Install Miniconda, or use tools/requirements.txt with a venv."; exit 1; fi

# 1. Python environment
if conda env list | awk '{print $1}' | grep -qx "$ENV_NAME"; then echo "[1/3] conda env '$ENV_NAME' exists"; else
  echo "[1/3] creating conda env '$ENV_NAME' (a few minutes)"; conda env create -f "$HERE/environment.yml"; fi

# 2. OpenNI2 runtime with the Orbbec driver (official Orbbec download, ~540 MB zip, kept ~3 MB)
if [ -f "$REDIST/libOpenNI2.so" ]; then echo "[2/3] OpenNI2 runtime present"; else
  echo "[2/3] downloading the Orbbec OpenNI SDK"
  TMP="$(mktemp -d)"; mkdir -p "$REDIST"
  curl -L -o "$TMP/sdk.zip" https://dl.orbbec3d.com/dist/openni2/v2.3.0.86-beta6/Orbbec_OpenNI_v2.3.0.86-beta6_linux_release.zip
  unzip -q "$TMP/sdk.zip" -d "$TMP" && unzip -q "$TMP"/OpenNI_*_linux_x64.zip -d "$TMP/x64"
  SDK="$(ls -d "$TMP"/x64/OpenNI_*_linux)"
  cp -r "$SDK"/sdk/libs/* "$REDIST/"; cp "$SDK/rules/orbbec-usb.rules" "$REDIST/../"
  rm -rf "$TMP"
fi

# 3. USB permission
if ls /etc/udev/rules.d 2>/dev/null | grep -qi -E "orbbec|556"; then echo "[3/3] udev rule present"; else
  echo "[3/3] USB rule missing. Run once:"
  echo "      sudo cp $REDIST/../orbbec-usb.rules /etc/udev/rules.d/556-orbbec-usb.rules && sudo udevadm control --reload && sudo udevadm trigger"
  echo "      and unplug/replug the camera."
fi
echo; echo "Done. Start everything with:  bash run.sh"
