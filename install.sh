#!/usr/bin/env bash
# Installs (or updates) the Workspace HUD in a Harness Desktop profile on
# macOS/Linux.
#
#   bash ./install.sh              # profile "desktop"
#   bash ./install.sh my-profile   # another profile
#
# The script copies the plugin into
#   $DSH_HOME/profiles/<profile>/node_modules/dsh-workspace-hud
# and makes sure "dsh-workspace-hud" is selected in dsh.profile.bundles.
# It also removes the pre-1.1 "@local/workspace-hud" installation.
set -euo pipefail

package_name="dsh-workspace-hud"
legacy_name="@local/workspace-hud"
profile_name="${1:-desktop}"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
profile_dir="$dsh_home/profiles/$profile_name"
manifest="$profile_dir/package.json"
dest="$profile_dir/node_modules/$package_name"
legacy_dir="$profile_dir/node_modules/@local/workspace-hud"

if [[ ! -f "$manifest" ]]; then
  echo "Harness profile not found: $profile_dir" >&2
  echo "Start Harness once, or install from the Plugins page instead." >&2
  exit 1
fi

for file in package.json index.js client.js cordis.patch.yml icon.svg README.md README.zh.md LICENSE; do
  if [[ ! -f "$source_dir/$file" ]]; then
    echo "Missing package file: $file" >&2
    exit 1
  fi
done

mkdir -p "$dest"
cp "$source_dir/package.json" "$source_dir/index.js" "$source_dir/client.js" \
   "$source_dir/cordis.patch.yml" "$source_dir/icon.svg" "$source_dir/README.md" \
   "$source_dir/README.zh.md" "$source_dir/LICENSE" "$dest/"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to update $manifest" >&2
  echo "Either install python3 or add \"$package_name\" to dsh.profile.bundles by hand." >&2
  exit 1
fi

python3 - "$manifest" "$package_name" "$legacy_name" <<'PY'
import json
import sys

path, name, legacy = sys.argv[1:4]
with open(path, encoding="utf-8") as handle:
    manifest = json.load(handle)

profile = manifest.setdefault("dsh", {}).setdefault("profile", {})
bundles = [bundle for bundle in profile.get("bundles", []) if isinstance(bundle, str) and bundle and bundle != legacy]
if name not in bundles:
    bundles.append(name)
profile["bundles"] = bundles

with open(path, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(manifest, handle, indent=2, ensure_ascii=False)
    handle.write("\n")

print("profile bundles: " + ", ".join(bundles))
PY

# Remove the legacy package folder once the new bundle is selected.
rm -rf "$legacy_dir"
if [[ -d "$profile_dir/node_modules/@local" ]] && [[ -z "$(ls -A "$profile_dir/node_modules/@local")" ]]; then
  rmdir "$profile_dir/node_modules/@local"
fi

echo "Installed $package_name -> $dest"
echo "Harness hot-reloads the profile and the client bundle; no restart should be needed."
