"""供根目录 scripts/build.mjs 调用的后端导入校验。"""

from app.main import app

print("backend import ok:", app.title)
