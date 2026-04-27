@echo off
set NODE_PRESERVE_SYMLINKS=1
set NODE_PRESERVE_SYMLINKS_MAIN=1
node src\index.js --mock
pause
