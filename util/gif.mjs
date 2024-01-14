import { BitmapImage, GifFrame, GifUtil } from "gifwrap";
import Jimp from "jimp";
import { mkdirp } from "mkdirp";
import path from "path";
import url, { fileURLToPath } from "url";

/**
 * ファイルを読み込んでgifwrapのGIFオブジェクトを返す
 * @param {string} fileName
 * @param {string} basePath
 * @returns {Promise<import("gifwrap").Gif>}
 */
export async function readGif(fileName, basePath) {
  const inputPath = fileURLToPath(new URL(fileName, basePath));
  return await GifUtil.read(inputPath.toString());
}

/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   w: number;
 *   h: number;
 *   frame: number
 *   scale: number;
 * }} RegularManipulateOption
 */

/**
 * @typedef {Partial<RegularManipulateOption> & {
 *   useFrames?: (number | Partial<RegularManipulateOption>)[];
 * }} ManipulateOption
 */

/**
 * 渡されたOptionをフレームごとの設定情報に正規化する
 *
 * @param {ManipulateOption & {
 *   blitImages?: (ManipulateOption & { posX: number, posY: number} )[]
 * }} option
 * @param {number} frameCount
 *
 * @returns {(RegularManipulateOption & {
 *   blitImages: (RegularManipulateOption & { posX: number, posY: number})[]
 * })[]}
 */
function regularizeOption({ blitImages = [], ...option }, frameCount) {
  const outputFrameCount = Math.max(
    ...blitImages.map((bi) => bi.useFrames?.length || 0),
    option.useFrames?.length || frameCount,
  );

  return Array.from({ length: outputFrameCount }).map((_, index) => {
    /**
     * @param {ManipulateOption} option
     * @returns {RegularManipulateOption}
     */
    function regularizeOneOption({ useFrames, ...opt }) {
      const currentUseFrame = useFrames && useFrames[index % useFrames.length];
      const fixedFrame =
        (() => {
          if (typeof currentUseFrame === "number") {
            return currentUseFrame;
          } else if (typeof currentUseFrame?.frame === "number") {
            return currentUseFrame.frame;
          }
          return opt.frame ? opt.frame : index;
        })() % frameCount;

      return {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        scale: 1,
        ...opt,
        ...(typeof currentUseFrame === "object" ? currentUseFrame : {}),
        frame: fixedFrame,
      };
    }

    const newOption = regularizeOneOption(option);
    return {
      ...newOption,
      blitImages: blitImages.map(({ posX, posY, ...biOption }) => ({
        posX,
        posY,
        ...regularizeOneOption({ ...newOption, ...biOption }),
      })),
    };
  });
}

/**
 * gifの指定したフレームをクロップ･スケール･合成処理する
 *
 * @param {Awaited<ReturnType<GifUtil.read>>} original
 * @param {ManipulateOption & {
 *   fileName?: string;
 *   basePath?: string;
 *   blitImages?: (ManipulateOption & { posX: number, posY: number} )[];
 * }} options
 */
export async function manipulate(
  original,
  { fileName = "", basePath = "", ...option },
) {
  /**
   * @param {RegularManipulateOption} option
   */
  function manipulateOneFrame({ frame, x, y, w, h, scale }) {
    const jimp = GifUtil.copyAsJimp(Jimp, original.frames[frame]);
    if (w > 0 && h > 0) {
      jimp.crop(x, y, w, h);
    }
    if (scale !== 1) {
      jimp.scale(scale, Jimp.RESIZE_NEAREST_NEIGHBOR);
    }
    return jimp;
  }

  const regularizedOption = regularizeOption(option, original.frames.length);
  const frames = regularizedOption.map((opt) => {
    const jimp = manipulateOneFrame(opt);

    for (const biOpt of opt.blitImages) {
      const biJimp = manipulateOneFrame(biOpt);
      jimp.blit(biJimp, biOpt.posX, biOpt.posY);
    }

    const frame = original.frames[opt.frame];
    return new GifFrame(new BitmapImage(jimp.bitmap), { ...frame });
  });

  const outPath = fileName && url.fileURLToPath(new URL(fileName, basePath));
  await mkdirp(path.dirname(outPath));
  console.log(`write ${outPath}`);

  return await GifUtil.write(outPath, frames, original);
}

/**
 * gifの1フレームをクロップ･スケール処理する
 *
 * @param {Awaited<ReturnType<GifUtil.read>>} original
 * @param {{
 *  fileName: string;
 *  basePath: string;
 *  x: number;
 *  y: number;
 *  w: number;
 *  h: number;
 *  frame: number;
 *  scale?: number;
 * }} options
 */
export async function manipulateFrame(
  original,
  { fileName, basePath, x, y, w, h, frame, scale = 1 },
) {
  const f = original.frames[frame];

  /** @type {import('jimp')} */
  const j = GifUtil.copyAsJimp(Jimp, f).crop(x, y, w, h);
  if (scale !== 1) {
    j.scale(5, Jimp.RESIZE_NEAREST_NEIGHBOR);
  }

  const outPath = url.fileURLToPath(new URL(fileName, basePath));
  await mkdirp(path.dirname(outPath));
  await j.writeAsync(outPath.toString());
  console.log(`manipulateFrame done. ${outPath}`);
}
