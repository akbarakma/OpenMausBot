#!/bin/sh
# Pair the iPhone with this Mac and turn on Developer Mode first.
set -eu
cd "$(dirname "$0")"

TEAM=${OMB_DEV_TEAM:-$(cat .dev-team 2>/dev/null || true)}
if [ -z "$TEAM" ]; then
  echo "Put your Apple team ID in ios-personal/.dev-team or OMB_DEV_TEAM." >&2
  exit 1
fi
APP=DerivedData/Build/Products/Debug-iphoneos/OpenMausCompanion.app

devices=$(mktemp)
spec=project.phone.yml
trap 'rm -f "$devices" "$spec"' EXIT
xcrun devicectl list devices --json-output "$devices" >/dev/null
udid=${OMB_DEVICE:-$(jq -r '.result.devices[]
  | select(.hardwareProperties.reality == "physical" and .connectionProperties.pairingState == "paired")
  | .hardwareProperties.udid' "$devices" | head -n1)}
if [ -z "$udid" ]; then
  echo "No paired iPhone found. Connect it and trust this Mac." >&2
  exit 1
fi

# shortcut: a free Apple ID cannot sign App Groups, so the phone build drops the
# widgets, the Share extension and the group; with a paid team, generate from
# project.yml as run-sim.sh does.
awk '/^      - target: (OpenMausCompanionWidgets|OpenMausShareExtension)$/ { next }
     /com\.apple\.security\.application-groups:/ { group = 1; next }
     group && /^ *- group\./ { group = 0; next }
     { group = 0; print }' project.yml > "$spec"
xcodegen generate --quiet --spec "$spec"
xcodebuild -project OpenMausCompanion.xcodeproj -scheme OpenMausCompanion \
  -destination "id=$udid" -derivedDataPath DerivedData -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic -quiet build

xcrun devicectl device install app --device "$udid" "$APP"
echo "Installed. A free Apple ID signature lasts 7 days; run this again to renew it."
