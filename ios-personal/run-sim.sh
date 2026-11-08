#!/bin/sh
# Open the simulator from T3's Device panel to boot it and watch it live.
set -eu
cd "$(dirname "$0")"

NAME=${OMB_SIM_NAME:-OMB iPhone 17}
RUNTIME=${OMB_SIM_RUNTIME:-26.5}
DEVICE_TYPE=com.apple.CoreSimulator.SimDeviceType.iPhone-17
# The simulator keychain refuses the pairing token without an application-identifier
# entitlement; any team id makes Xcode emit it, no provisioning profile is involved.
TEAM=${OMB_DEV_TEAM:-AAAAAAAAAA}
APP=DerivedData/Build/Products/Debug-iphonesimulator/OpenMausCompanion.app

runtime_id() {
  xcrun simctl list runtimes -j |
    jq -r --arg v "$RUNTIME" '.runtimes[] | select(.platform == "iOS" and .version == $v and .isAvailable) | .identifier' | head -n1
}

rt=$(runtime_id)
if [ -z "$rt" ]; then
  xcodebuild -downloadPlatform iOS -buildVersion "$RUNTIME"
  rt=$(runtime_id)
fi

udid=$(xcrun simctl list devices -j |
  jq -r --arg rt "$rt" --arg n "$NAME" '.devices[$rt][]? | select(.name == $n) | .udid' | head -n1)
[ -n "$udid" ] || udid=$(xcrun simctl create "$NAME" "$DEVICE_TYPE" "$rt")

state() { xcrun simctl list devices -j | jq -r --arg u "$udid" '.devices[][] | select(.udid == $u) | .state'; }

if [ "$(state)" = Booted ]; then
  simslim verify "$udid" --profile simslim.json >/dev/null || simslim on "$udid" --profile simslim.json
else
  simslim on "$udid" --profile simslim.json --preserve-boot-state
fi

xcodegen generate --quiet
xcodebuild -project OpenMausCompanion.xcodeproj -scheme OpenMausCompanion \
  -sdk iphonesimulator -destination "id=$udid" -derivedDataPath DerivedData \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual \
  -quiet build

if [ "$(state)" = Booted ]; then
  xcrun simctl install "$udid" "$APP"
  echo "Installed on $NAME ($udid). Launch com.openmausbot.app from T3's Device panel."
else
  echo "Built for $NAME ($udid). Open it in T3's Device panel, then run this again to install."
fi
