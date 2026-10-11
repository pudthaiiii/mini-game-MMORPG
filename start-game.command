#!/bin/bash
# เปิดเกม: รันโค้ดล่าสุดผ่าน dev server แล้วเปิดเบราว์เซอร์ให้เอง
# ครั้งแรกให้รันใน Terminal ด้วย:  bash start-game.command
# หลังจากนั้นดับเบิลคลิกไฟล์นี้ได้เลย
cd "$(dirname "$0")" || exit 1
chmod +x "$0" 2>/dev/null

# a double-clicked Terminal window doesn't always load Homebrew / nvm
if ! command -v npm >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
fi

pause_and_exit() {
  echo ""
  echo "$1"
  echo "เปิดไฟล์ play.html แทนได้ เล่นได้เลยโดยไม่ต้องมี Node.js"
  read -n 1 -s -r -p "กดปุ่มใดก็ได้เพื่อปิด"
  exit 1
}

command -v node >/dev/null 2>&1 || pause_and_exit "ไม่พบ Node.js — ติดตั้งได้จาก https://nodejs.org (ต้องเป็น 20.19 ขึ้นไป)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)' ||
  pause_and_exit "Node.js $(node -v) เก่าไป เกมนี้ต้องใช้ 20.19 หรือ 22.12 ขึ้นไป"

if [ ! -d node_modules/vite ]; then
  # node_modules for Apple Silicon was prepared and dropped in as split archives
  if ls node_modules/.install/node_modules.tgz.part* >/dev/null 2>&1; then
    echo "กำลังติดตั้ง node_modules ที่เตรียมไว้ให้..."
    cat node_modules/.install/node_modules.tgz.part* | tar xzf -
  fi
  [ -d node_modules/vite ] || npm install || pause_and_exit "npm install ไม่สำเร็จ"
fi

# first run: tidy up the setup leftovers and recreate node_modules/.bin links
if [ ! -s node_modules/.bin/vite ] || [ -d node_modules/.install ]; then
  echo "เตรียมไฟล์ครั้งแรก..."
  rm -rf node_modules/.install node_modules/.bin
  xattr -dr com.apple.quarantine node_modules 2>/dev/null
  npm rebuild --ignore-scripts >/dev/null 2>&1 || true
fi

echo "กำลังเปิดเกม... (ปิดหน้าต่างนี้เมื่อเล่นเสร็จ)"
exec node node_modules/vite/bin/vite.js
