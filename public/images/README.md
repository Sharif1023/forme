# FORME photographic assets

These assets were created for the FORME studio with the built-in image generation tool. They depict generated models and garments; they are not photographs of identified people or supplied product photography. No external photographer attribution is claimed.

## Complete outfit photographs

Twelve source sheets in `outfits/*-matrix.png` provide 108 complete outfit master photographs. Every sheet contains a three-column, three-row matrix for one top, three pants and three shoes. Each cell is a whole photographed person wearing the complete outfit; the renderer never joins garment or body sections from different photographs.

Men's matrix rows are slim chinos, relaxed pleated trousers and straight denim. Columns are sneakers, penny loafers and Chelsea boots. Women's rows are tailored wide-leg trousers, straight jeans and cropped cigarette pants. Columns are minimal sneakers, pointed slingback pumps and women's leather ankle boots. Tops and footwear use distinct men's and women's cuts.

The prepared `looks/men/*.webp` and `looks/women/*.webp` files contain all 2,916 complete outfit and colour combinations: 2 models × 6 tops × 3 pants × 3 shoes × 3 top colours × 3 pants colours × 3 shoe colours. Product and colour IDs resolve directly to the exact image. Size choices do not change an image.

## Product photographs

`products-men-source.png` and `products-women-source.png` each contain a separate four-column, three-row product sheet. The 72 prepared `products/*.webp` thumbnails provide one photograph per catalog product and colour. Women's pumps, ankle boots, pants and tops have their own source photographs; no shared generic garment sprite is used.

## Rebuilding assets

Run `npm run images:build` from the project directory after updating source photographs or the catalog. The build extracts complete cells, prepares fabric colours locally, preserves image transparency and writes the full outfit WebPs, product thumbnails and `looks/coverage.json`. Use `npm run images:build -- --force` to regenerate existing files.

For a correction to one top's source sheet, use `npm run images:build -- --force-top=w-shirt-band` (replace the product ID as needed). This rebuilds only that top's 243 outfit variants and preserves every other prepared photograph. The padded women's band-collar sheet uses person-relative shoe boundaries and separate sleeve contours so trouser colours cannot cover its cuffs or footwear.

The browser displays complete prepared images. It does not recolour body sections or assemble garments at runtime. Garment details and colour accuracy are approximate; selected sizes do not modify body measurements or predict fit.

## Generation prompts

Exact source prompts and generated file references are recorded in `outfits/prompts-men-oxford.json`, `outfits/prompts-men-shirts-extra.json`, `outfits/prompts-men-tees.json`, `outfits/prompts-women.json`, `products-men-source.prompt.json` and `products-women-prompt.json`.
