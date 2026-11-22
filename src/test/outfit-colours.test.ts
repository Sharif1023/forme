import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

async function materialColour(name: string, x: number, y: number) {
  const { data } = await sharp(path.join(process.cwd(), "public/images/looks/women", name))
    .extract({ left: x - 2, top: y - 2, width: 5, height: 5 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colour = [0, 0, 0];
  let samples = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3]! < 200) continue;
    for (let channel = 0; channel < 3; channel++) colour[channel]! += data[offset + channel]!;
    samples++;
  }
  expect(samples).toBeGreaterThan(15);
  return colour.map((value) => value / samples);
}

describe("Prepared clothing colour boundaries", () => {
  it("keeps both navy shirt cuffs navy beside cream wide-leg trousers", async () => {
    const name = "w-shirt-band--navy__w-pant-wide--cream__w-shoe-sneaker--white.webp";
    for (const [x, y] of [
      [101, 246],
      [240, 229],
    ]) {
      const [red, green, blue] = await materialColour(name, x!, y!);
      expect(Math.max(red!, green!, blue!)).toBeLessThan(100);
      expect(blue!).toBeGreaterThan(red! * 1.2);
    }
  });

  it("keeps the right navy forearm intact where the sleeve touches ecru jeans", async () => {
    const [red, green, blue] = await materialColour(
      "w-shirt-band--navy__w-pant-jean--ecru__w-shoe-pump--coral.webp",
      232,
      210,
    );
    expect(Math.max(red!, green!, blue!)).toBeLessThan(100);
    expect(blue!).toBeGreaterThan(red! * 1.2);
  });

  it.each([
    ["men", "m-tee-crew--ivory__m-pant-chino--navy__m-shoe-sneaker"],
    ["men", "m-tee-v--white__m-pant-pleat--charcoal__m-shoe-sneaker"],
    ["women", "w-tee-boxy--coral__w-pant-cigarette--black__w-shoe-sneaker"],
  ])("prepares the entire black sneaker including its upper for %s %s", async (gender, key) => {
    const load = (colour: string) =>
      sharp(path.join(process.cwd(), "public/images/looks", gender, `${key}--${colour}.webp`))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const white = await load("white");
    const black = await load("black");
    let reference = 0,
      prepared = 0,
      samples = 0;
    for (let y = 430; y < white.info.height; y++)
      for (let x = 0; x < white.info.width; x++) {
        const offset = (y * white.info.width + x) * 4;
        if (
          white.data[offset + 3]! < 200 ||
          Math.min(white.data[offset]!, white.data[offset + 1]!, white.data[offset + 2]!) < 185
        )
          continue;
        reference += white.data[offset]! + white.data[offset + 1]! + white.data[offset + 2]!;
        prepared += black.data[offset]! + black.data[offset + 1]! + black.data[offset + 2]!;
        samples++;
      }
    expect(samples).toBeGreaterThan(100);
    expect(prepared / reference).toBeLessThan(0.45);
  });

  it("colours the body of coral slingback pumps independently of cream trousers", async () => {
    const [red, green, blue] = await materialColour(
      "w-shirt-band--natural__w-pant-wide--cream__w-shoe-pump--coral.webp",
      143,
      486,
    );
    expect(red!).toBeGreaterThan(green! * 1.3);
    expect(red!).toBeGreaterThan(blue! * 1.5);
  });

  it("keeps cognac boot uppers brown below black cropped trousers", async () => {
    const [red, green, blue] = await materialColour(
      "w-shirt-band--natural__w-pant-cigarette--black__w-shoe-boot--cognac.webp",
      141,
      454,
    );
    expect(red!).toBeGreaterThan(65);
    expect(red!).toBeGreaterThan(green! * 1.25);
    expect(red!).toBeGreaterThan(blue! * 1.6);
  });
});
