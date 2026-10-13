# Logo 导出命令

## 说明

- 使用 ImageMagick 的 `magick` 命令导出 PNG.
- 背景保持透明.
- 宽度按原始比例自动缩放.
- 推荐直接从 SVG 导出, 避免二次缩放损失.
- 先用 `-density 384` 按 4 倍分辨率读入 SVG, 再用 `-filter Triangle` 缩小到目标尺寸, 小尺寸边缘更干净.

## 文件选用

| 场景 | 文件 |
| --- | --- |
| 浅色背景, 显示高度大于 40px | `logo-with-text.svg` |
| 浅色背景, 显示高度不超过 40px (如导航栏) | `logo-compact.svg` |
| 深色背景 | `logo-with-text-dark.svg`, 小尺寸用 `logo-compact-dark.svg` |
| 头像, 显示尺寸大于 64px | `avatar.svg` |
| 头像显示尺寸不超过 64px, favicon | `logo.svg` (头像可上传第 7 节导出的 `logo400h.png`) |

## 重新生成 SVG

全部 SVG 都由 `tools/gen-logo.mjs` 生成 (`logo.svg` 的输出与原稿逐字节一致), 图标路径, 笔画宽, 柔化半径, 排版位置等参数都在脚本顶部. 修改参数后在当前目录运行 (需要 Node.js):

```cmd
node tools/gen-logo.mjs
```

直接手改生成的 SVG, 会在下次生成时被覆盖.

## 1. 导出高度 50px 的透明 PNG

```cmd
magick -background none -density 384 "logo-with-text.svg" -filter Triangle -resize x50 -alpha on PNG32:"logo-with-text-50h.png"
```

## 2. 导出高度 100px 的透明 PNG

```cmd
magick -background none -density 384 "logo-with-text.svg" -filter Triangle -resize x100 -alpha on PNG32:"logo-with-text-100h.png"
```

## 3. 导出高度 150px 的透明 PNG

```cmd
magick -background none -density 384 "logo-with-text.svg" -filter Triangle -resize x150 -alpha on PNG32:"logo-with-text-150h.png"
```

## 4. 覆盖导出当前默认 PNG

```cmd
magick -background none -density 384 "logo-with-text.svg" -filter Triangle -resize x50 -alpha on PNG32:"logo-with-text.png"
```

## 5. 检查 PNG 是否为透明背景

```cmd
magick identify -verbose "logo-with-text-50h.png"
```

可重点查看这些字段:

- `Type: TrueColorAlpha`
- `png:IHDR.color_type: 6 (RGBA)`

## 6. 在当前目录执行的完整示例

```cmd
cd /d C:\Desktop\logo
magick -background none -density 384 "logo-with-text.svg" -filter Triangle -resize x50 -alpha on PNG32:"logo-with-text-50h.png"
```

## 7. 将 logo.svg 转成透明背景的 ICO

说明:

- `logo.svg` 是方形图标, 更适合导出 `.ico`.
- `.ico` 一般会内置多个尺寸, 方便浏览器和 Windows 在不同场景下选择.

```cmd
magick -background none -density 384 "logo.svg" -filter Triangle -define icon:auto-resize=16,24,32,48,64,128,256 "logo.ico"
magick -background none -density 384 "logo.svg" -filter Triangle -resize x400 -alpha on PNG32:"logo400h.png"
```

## 8. 检查 ICO 中包含的尺寸

```cmd
magick identify "logo.ico"
```

## 9. 如果要把 logo-with-text.svg 转成 ICO

说明:

- 可以转换, 但不推荐用作 favicon 或系统图标.
- 原因是它是横向长图, 缩到 16x16 或 32x32 后文字通常不可读.

```cmd
magick -background none -density 384 "logo-with-text.svg" -filter Triangle -define icon:auto-resize=16,24,32,48,64,128,256 "logo-with-text.ico"
```

## 10. 导出 200px 与 50px 的 avatar.png

说明:

- `avatar.svg` 是正方形头像, 适合直接导出为 200x200 PNG.
- 即使保留 `-background none`, 最终仍会按 SVG 内的黄色背景导出.
- 50px 时英文行只有约 4px 高, 无法辨认; 头像显示尺寸不超过 64px 时更推荐用 `logo.svg`.

```cmd
magick -background none -density 384 "avatar.svg" -filter Triangle -resize 200x200 -alpha on PNG32:"avatar-200.png"
magick -background none -density 384 "avatar.svg" -filter Triangle -resize 50x50 -alpha on PNG32:"avatar-50.png"
```

## 11. 导出紧凑版与深色版

说明:

- `logo-compact.svg` 去掉了英文行, 同样高度下中文比 `logo-with-text.svg` 大约 20%, 适合高度不超过 40px 的场景.
- `-dark` 版字标为金色, 用于深色背景; J 图标不变.

```cmd
magick -background none -density 384 "logo-compact.svg" -filter Triangle -resize x40 -alpha on PNG32:"logo-compact-40h.png"
magick -background none -density 384 "logo-compact-dark.svg" -filter Triangle -resize x40 -alpha on PNG32:"logo-compact-dark-40h.png"
magick -background none -density 384 "logo-with-text-dark.svg" -filter Triangle -resize x50 -alpha on PNG32:"logo-with-text-dark-50h.png"
```
