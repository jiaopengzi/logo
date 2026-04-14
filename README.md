# Logo 导出命令

当前目录: `C:\Desktop\logo`

说明:
- 使用 ImageMagick 的 `magick` 命令导出 PNG.
- 背景保持透明.
- 宽度按原始比例自动缩放.
- 推荐直接从 SVG 导出, 避免二次缩放损失.

## 1. 导出高度 50px 的透明 PNG

```cmd
magick -background none "logo-with-text.svg" -resize x50 -alpha on PNG32:"logo-with-text-50h.png"
```

## 2. 导出高度 100px 的透明 PNG

```cmd
magick -background none "logo-with-text.svg" -resize x100 -alpha on PNG32:"logo-with-text-100h.png"
```

## 3. 导出高度 150px 的透明 PNG

```cmd
magick -background none "logo-with-text.svg" -resize x150 -alpha on PNG32:"logo-with-text-150h.png"
```

## 4. 覆盖导出当前默认 PNG

```cmd
magick -background none "logo-with-text.svg" -resize x50 -alpha on PNG32:"logo-with-text.png"
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
magick -background none "logo-with-text.svg" -resize x50 -alpha on PNG32:"logo-with-text-50h.png"
```

## 7. 将 logo.svg 转成透明背景的 ICO

说明:
- `logo.svg` 是方形图标, 更适合导出 `.ico`.
- `.ico` 一般会内置多个尺寸, 方便浏览器和 Windows 在不同场景下选择.

```cmd
magick -background none "logo.svg" -define icon:auto-resize=16,24,32,48,64,128,256 "logo.ico"
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
magick -background none "logo-with-text.svg" -define icon:auto-resize=16,24,32,48,64,128,256 "logo-with-text.ico"
```

## 10. 导出 200px 的 avatar.png

说明:
- `avatar.svg` 是正方形头像, 适合直接导出为 200x200 PNG.
- 即使保留 `-background none`, 最终仍会按 SVG 内的黄色背景导出.

```cmd
magick -background none "avatar.svg" -resize 200x200 -alpha on PNG32:"avatar-200.png"
```