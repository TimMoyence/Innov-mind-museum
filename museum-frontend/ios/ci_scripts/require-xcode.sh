#!/bin/sh
set -e

required_major=26
installed=$(xcodebuild -version | sed -n 's/^Xcode //p')

if [ "${installed%%.*}" != "$required_major" ]; then
  echo "ERROR: Expo SDK 55 se compile avec Xcode $required_major ; ce runner a Xcode $installed, dont la SDK arrête l'app au lancement (UIScene). Fixer Xcode $required_major dans le workflow Xcode Cloud." >&2
  exit 1
fi

echo "Xcode $installed"
